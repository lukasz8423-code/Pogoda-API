/**
 * Central Weather & IMGW Telemetry API Service for Aura Pogoda
 * Provides optimized live data fetching, automated polling with cache-busting (?t=${Date.now()}),
 * and instant freshness synchronization.
 */

export interface FetchWeatherOptions {
  lat: number;
  lng: number;
  isRefresh?: boolean;
  forceFresh?: boolean;
  timeoutMs?: number;
}

export interface WeatherApiResponse {
  serverPayload: any | null;
  omJson: any | null;
}

/**
 * Builds Open-Meteo API query with optional parameter depth
 */
export function buildOpenMeteoUrl(lat: number, lng: number, mode: 'full' | 'standard' | 'minimal' = 'full'): string {
  const baseUrl = "https://api.open-meteo.com/v1/forecast";
  
  let currentParams = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl";
  let hourlyParams = "temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m";
  let dailyParams = "temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_gusts_10m_max";
  let extraParams = "";

  if (mode === 'full' || mode === 'standard') {
    currentParams += ",precipitation,rain,showers,snowfall,cloud_cover,uv_index,visibility";
    hourlyParams += ",apparent_temperature,precipitation,uv_index,cloud_cover";
    dailyParams += ",sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max";
  }

  if (mode === 'full') {
    currentParams += ",cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,direct_normal_irradiance";
    hourlyParams += ",pressure_msl,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_temperature_0cm,evapotranspiration";
    dailyParams += ",apparent_temperature_max,apparent_temperature_min";
    extraParams += "&minutely_15=precipitation,precipitation_probability,rain,snowfall";
  }

  const cacheBuster = `&t=${Date.now()}`;
  return `${baseUrl}?latitude=${lat}&longitude=${lng}&current=${currentParams}${extraParams}&hourly=${hourlyParams}&daily=${dailyParams}&forecast_days=3&past_days=1&timezone=auto${cacheBuster}`;
}

/**
 * Fetches fresh telemetry for the nearest IMGW station with cache-busting
 */
export async function fetchFreshImgwStation(lat: number, lng: number, timeoutMs = 5000): Promise<any | null> {
  const ts = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api/imgw/nearest?lat=${lat}&lng=${lng}&t=${ts}&force=true`, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.temp === 'number') {
        return data;
      }
    }
  } catch (e) {
    // silently catch timeout / network error for fallback
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Central fetcher for combined forecast and station telemetry
 */
export async function fetchWeatherData(options: FetchWeatherOptions): Promise<WeatherApiResponse> {
  const { lat, lng, isRefresh = false, forceFresh = false, timeoutMs = 6000 } = options;
  const ts = Date.now();

  let serverPayload: any = null;
  let omJson: any = null;

  // 1. Try server proxy route with cache-busting timestamp
  try {
    const proxyController = new AbortController();
    const proxyTimeout = setTimeout(() => proxyController.abort(), timeoutMs);
    const forceParam = (isRefresh || forceFresh) ? '&force=true' : '';
    
    const apiRes = await fetch(`/api/weather?lat=${lat}&lng=${lng}&t=${ts}${forceParam}`, {
      signal: proxyController.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    clearTimeout(proxyTimeout);

    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && (json.current || json.weather)) {
        serverPayload = json;
        omJson = json.weather || (json.current ? json : null);
      }
    }
  } catch (proxyErr) {
    console.warn("⚠️ [weatherApi] Express proxy /api/weather call error, proceeding to client fallback:", proxyErr);
  }

  // 2. Client-side fallback if server response was not available
  if (!omJson) {
    let omRes: Response | undefined;
    let usedUrl = buildOpenMeteoUrl(lat, lng, 'full');

    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 5000);
      omRes = await fetch(usedUrl, { signal: controller.signal });
      clearTimeout(tId);

      if (!omRes.ok) {
        usedUrl = buildOpenMeteoUrl(lat, lng, 'standard');
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 4000);
        omRes = await fetch(usedUrl, { signal: c2.signal });
        clearTimeout(t2);
      }

      if (!omRes.ok) {
        usedUrl = buildOpenMeteoUrl(lat, lng, 'minimal');
        const c3 = new AbortController();
        const t3 = setTimeout(() => c3.abort(), 4000);
        omRes = await fetch(usedUrl, { signal: c3.signal });
        clearTimeout(t3);
      }
    } catch (err) {
      try {
        usedUrl = buildOpenMeteoUrl(lat, lng, 'minimal');
        const c4 = new AbortController();
        const t4 = setTimeout(() => c4.abort(), 4000);
        omRes = await fetch(usedUrl, { signal: c4.signal });
        clearTimeout(t4);
      } catch (retryErr) {
        // ignore
      }
    }

    if (omRes && omRes.ok) {
      omJson = await omRes.json();
    }

    // Secondary IMGW station lookup if serverPayload is missing station info
    if (!serverPayload?.imgwStation) {
      const freshStation = await fetchFreshImgwStation(lat, lng, 4000);
      if (freshStation) {
        serverPayload = {
          ...(serverPayload || {}),
          imgwStation: freshStation
        };
      }
    }
  }

  return { serverPayload, omJson };
}
