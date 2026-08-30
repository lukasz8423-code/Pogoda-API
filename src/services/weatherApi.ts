/**
 * Central Weather & IMGW Telemetry API Service for Aura Pogoda
 * Provides optimized live data fetching, automated polling with cache-busting (?t=${Date.now()}),
 * and instant freshness synchronization.
 */

import { Capacitor } from '@capacitor/core';
import { fetchNearestImgwStation } from '../utils/imgw';

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
  
  let currentParams = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,uv_index";
  let hourlyParams = "temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m";
  let dailyParams = "temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_gusts_10m_max";
  let extraParams = "";

  if (mode === 'full' || mode === 'standard') {
    currentParams += ",precipitation,rain,showers,snowfall,cloud_cover,visibility";
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
export async function fetchFreshImgwStation(lat: number, lng: number, timeoutMs = 4000): Promise<any | null> {
  const isNative = Capacitor.isNativePlatform() || window.location.protocol === 'file:';

  // 1. On Web preview, try backend Express proxy first
  if (!isNative) {
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
  }

  // 2. Direct client fallback (works on both Native Mobile APK and Web when proxy fails)
  try {
    const directStation = await fetchNearestImgwStation(lat, lng);
    if (directStation && typeof directStation.temp === 'number') {
      return directStation;
    }
  } catch (e) {
    console.warn("Direct IMGW station fetch fallback error:", e);
  }

  return null;
}

// Module-level cache for IMGW station measurement timestamps to detect new reports
interface ImgwStationCacheEntry {
  stationName: string | null;
  measurementTime: string | null;
  fetchedAt: number;
  data: any;
}

const lastImgwReportCache = new Map<string, ImgwStationCacheEntry>();

/**
 * Determines whether an IMGW measurement time represents a newly published report,
 * an identical report, or an uninitialized report.
 */
export function isNewImgwReport(
  previousMeasurementTime: string | null | undefined,
  currentMeasurementTime: string | null | undefined
): { isNewReport: boolean; changeStatus: 'NEW' | 'IDENTICAL' | 'OLDER' | 'INITIAL' } {
  if (!currentMeasurementTime) {
    return { isNewReport: false, changeStatus: 'INITIAL' };
  }
  if (!previousMeasurementTime) {
    return { isNewReport: false, changeStatus: 'INITIAL' };
  }
  const currTrim = currentMeasurementTime.trim();
  const prevTrim = previousMeasurementTime.trim();
  if (currTrim === prevTrim) {
    return { isNewReport: false, changeStatus: 'IDENTICAL' };
  }
  return { isNewReport: true, changeStatus: 'NEW' };
}

/**
 * Central fetcher for combined forecast and station telemetry
 */
export async function fetchWeatherData(options: FetchWeatherOptions): Promise<WeatherApiResponse> {
  const { lat, lng, isRefresh = false, forceFresh = false, timeoutMs = 4000 } = options;
  const ts = Date.now();
  const isNative = Capacitor.isNativePlatform() || window.location.protocol === 'file:';

  let serverPayload: any = null;
  let omJson: any = null;

  // 1. On Web Preview (non-native), try backend Express proxy route with cache-busting timestamp
  if (!isNative) {
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
  }

  // 2. Client-side fallback / Native APK execution (direct Open-Meteo)
  if (!omJson) {
    let omRes: Response | undefined;
    let usedUrl = buildOpenMeteoUrl(lat, lng, 'full');

    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 5000);
      omRes = await fetch(usedUrl, { signal: controller.signal });
      clearTimeout(tId);

      if (!omRes || !omRes.ok) {
        usedUrl = buildOpenMeteoUrl(lat, lng, 'standard');
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), 4000);
        omRes = await fetch(usedUrl, { signal: c2.signal });
        clearTimeout(t2);
      }

      if (!omRes || !omRes.ok) {
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
  }

  // 3. Always ensure fresh IMGW station telemetry is fetched independently
  if (!serverPayload?.imgwStation) {
    try {
      const freshStation = await fetchFreshImgwStation(lat, lng, 4000);
      if (freshStation) {
        serverPayload = {
          ...(serverPayload || {}),
          imgwStation: freshStation
        };
      }
    } catch (e) {
      console.warn("IMGW independent fetch failed, continuing with Open-Meteo forecast:", e);
    }
  }

  // 4. Compute source-specific freshness metadata
  const now = Date.now();
  const omAgeSeconds = Math.max(0, Math.floor((now - ts) / 1000));
  const omStatus: 'FRESH' | 'STALE' | 'ERROR' = omJson ? (omAgeSeconds < 180 ? 'FRESH' : 'STALE') : 'ERROR';
  const omForecastTimestamp = omJson?.current?.time || undefined;

  const geoKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cachedImgwEntry = lastImgwReportCache.get(geoKey);

  const imgwStation = serverPayload?.imgwStation;
  const currentImgwMeasurementTime = imgwStation?.measurementTime || imgwStation?.lastSync || null;

  const reportComparison = isNewImgwReport(cachedImgwEntry?.measurementTime, currentImgwMeasurementTime);

  // Update IMGW cache
  if (imgwStation && currentImgwMeasurementTime) {
    lastImgwReportCache.set(geoKey, {
      stationName: imgwStation.stationName || null,
      measurementTime: currentImgwMeasurementTime,
      fetchedAt: now,
      data: imgwStation
    });
  }

  let imgwReportAgeMinutes: number | null = null;
  let imgwFreshnessStatus: 'FRESH' | 'WAITING_NEW_REPORT' | 'OUTDATED' = 'FRESH';

  if (currentImgwMeasurementTime) {
    let dateObj: Date | null = null;
    const rawTime = imgwStation?.rawMeasurementTime;
    if (rawTime && typeof rawTime === 'string' && rawTime.includes('-')) {
      const isoStr = rawTime.includes('T') ? rawTime : `${rawTime.replace(' ', 'T')}Z`;
      const parsed = new Date(isoStr);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }
    if (!dateObj) {
      if (currentImgwMeasurementTime.includes('-') || currentImgwMeasurementTime.includes('.')) {
        dateObj = new Date(currentImgwMeasurementTime.replace(' ', 'T'));
      } else if (currentImgwMeasurementTime.includes(':')) {
        const d = new Date();
        const parts = currentImgwMeasurementTime.trim().split(' ')[0].split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) {
          dateObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
        }
      }
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      imgwReportAgeMinutes = Math.max(0, Math.floor((now - dateObj.getTime()) / 60000));
      if (imgwReportAgeMinutes > 180) {
        imgwFreshnessStatus = 'OUTDATED';
      } else if (imgwReportAgeMinutes > 75) {
        imgwFreshnessStatus = 'WAITING_NEW_REPORT';
      } else {
        imgwFreshnessStatus = 'FRESH';
      }
    }
  }

  const freshnessMetadata = {
    omFetchTimestamp: ts,
    omAgeSeconds,
    omStatus,
    omForecastTimestamp,
    imgwMeasurementTime: currentImgwMeasurementTime || undefined,
    previousImgwMeasurementTime: cachedImgwEntry?.measurementTime || undefined,
    imgwFetchTimestamp: now,
    imgwReportAgeMinutes,
    imgwFreshnessStatus,
    hasNewImgwReport: reportComparison.isNewReport,
    imgwReportChangeStatus: reportComparison.changeStatus
  };

  if (serverPayload) {
    serverPayload.freshnessMetadata = freshnessMetadata;
  } else {
    serverPayload = {
      freshnessMetadata
    };
  }

  return { serverPayload, omJson };
}
