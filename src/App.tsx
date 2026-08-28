import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import PhoneFrame from "./components/PhoneFrame";
import IntroScreen from "./components/IntroScreen";
import MainWeather from "./components/MainWeather";
import WeatherSkeleton from "./components/WeatherSkeleton";
import WeatherError from "./components/WeatherError";
import AppErrorBoundary from "./components/AppErrorBoundary";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { detectUserLocation, isPolandCoordinates, getLastValidLocationOrFallback, isValidCityName, reverseGeocode } from "./utils/geolocation";
import { GeoDiagnosticInfo } from "./components/PwaDiagnosticModal";
import { fetchNearestImgwSynop, fetchNearestImgwHydro } from "./utils/imgw";
import { fetchNearestGiosAirQuality } from "./utils/gios";

import { WeatherResponse } from "./types";
import { getInstallationId, cachedFetch, CACHE_TTLS, isDeveloperMode } from "./utils/cache";
import { checkBetaTrialStatus } from "./utils/betaTrial";
import BetaExpiredScreen from "./components/BetaExpiredScreen";

export default function App() {
  const [isBetaExpired] = useState<boolean>(() => {
    try {
      return checkBetaTrialStatus().isExpired;
    } catch (e) {
      console.warn("Beta trial status check fallback:", e);
      return false;
    }
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [customCityName, setCustomCityName] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus] = useState<string>("Uruchamianie...");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setIntroMessage] = useState<string | null>(null);
  const [geoDiagnostic, setGeoDiagnostic] = useState<GeoDiagnosticInfo | null>(null);

  const isStartingUpRef = useRef(false);
  const isFetchingWeatherRef = useRef(false);

  const updateGeoDiagnostic = (lat: number, lng: number, city?: string, method?: string, accuracy?: number) => {
    setGeoDiagnostic({
      lat,
      lng,
      cityName: city,
      method: method || "GPS / Auto",
      accuracy,
      timestamp: new Date().toISOString(),
      weatherCoordsUsed: { lat, lng }
    });
  };
  
  // 0. Handle SPA redirect from 404.html on static hosts like GitHub Pages
  useEffect(() => {
    try {
      const l = window.location;
      if (l.search && l.search[1] === '/') {
        const decoded = l.search.slice(1).split('&').map(s => s.replace(/~and~/g, '&')).join('?');
        const basePath = l.pathname.endsWith('/') ? l.pathname.slice(0, -1) : l.pathname;
        window.history.replaceState(null, '', (basePath || '') + decoded + l.hash);
      }
    } catch (e) {
      console.warn("SPA redirect handler notice:", e);
    }
  }, []);

  // Restore last cached weather on initial load and detect real GPS / IP location asynchronously
  useEffect(() => {
    if (isStartingUpRef.current) return;
    isStartingUpRef.current = true;

    const startupSequence = async () => {
      // Ensure anonymous installationId is generated for web testing diagnostics
      const instId = getInstallationId();
      console.log("Aura Web Installation ID:", instId, "Developer Mode:", isDeveloperMode());

      let hasCachedData = false;

      // 1. Fast path: load cache first for instant display on frame 1
      try {
        const savedCoordsStr = localStorage.getItem("aura_last_coords");
        const savedCityStr = localStorage.getItem("aura_last_city");
        const savedWeatherStr = localStorage.getItem("aura_last_weather");
        const savedMethodStr = localStorage.getItem("aura_last_method");
        
        console.log("💾 [Storage Telemetry -> Load Cache]", {
          hasSavedCoords: !!savedCoordsStr,
          savedCoordsStr,
          savedCityStr,
          savedMethodStr,
          hasSavedWeather: !!savedWeatherStr
        });

        if (savedCoordsStr && savedWeatherStr) {
          const parsedCoords = JSON.parse(savedCoordsStr);
          const isManual = savedMethodStr === "manual";
          
          // Safety checks:
          // 1. If manual: must be valid global coordinates and not CJK/Shanghai
          // 2. If auto GPS: must be within Poland bounds
          const isValidCoords = parsedCoords &&
                               typeof parsedCoords.lat === 'number' && typeof parsedCoords.lng === 'number' &&
                               !isNaN(parsedCoords.lat) && !isNaN(parsedCoords.lng) &&
                               !(parsedCoords.lat === 0 && parsedCoords.lng === 0);

          const isAllowed = isManual 
            ? isValidCoords && (parsedCoords.lat >= -90 && parsedCoords.lat <= 90 && parsedCoords.lng >= -180 && parsedCoords.lng <= 180)
            : isValidCoords && isPolandCoordinates(parsedCoords.lat, parsedCoords.lng);
          
          const isIpArtifact = savedMethodStr === "ip" || savedMethodStr === "cached" || 
                              (!savedMethodStr && (savedCityStr === "Gdańsk" || savedCityStr === "Łódź" || savedCityStr === "Nieznana lokalizacja" || savedCityStr === "Szanghaj" || savedCityStr === "Shanghai"));

          if (!isAllowed || isIpArtifact) {
            console.warn("🚨 [Storage Telemetry -> Purge Stale]", {
              reason: !isAllowed ? "Coordinates not allowed/outside bounds" : "IP artifact fallback",
              city: savedCityStr,
              coords: parsedCoords,
              method: savedMethodStr
            });
            try {
              localStorage.removeItem("aura_last_coords");
              localStorage.removeItem("aura_last_city");
              localStorage.removeItem("aura_last_weather");
              localStorage.removeItem("aura_last_method");
            } catch (e) {
              console.warn("Failed to remove items from localStorage", e);
            }
          } else {
            const parsedWeather = JSON.parse(savedWeatherStr);
            if (parsedCoords && typeof parsedCoords.lat === 'number' && parsedWeather) {
              setCoords(parsedCoords);
              if (savedCityStr) {
                setCustomCityName(savedCityStr);
              }
              setWeatherData(parsedWeather);
              updateGeoDiagnostic(parsedCoords.lat, parsedCoords.lng, savedCityStr || parsedWeather.city, savedMethodStr || (isManual ? "Ręczny wybór" : "GPS"));
              hasCachedData = true;
              console.log("✅ [Storage Telemetry -> Cache Applied]", {
                city: savedCityStr || parsedWeather.city,
                coords: parsedCoords,
                method: savedMethodStr
              });
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load cache", e);
      }

      // If we have cached data, trigger non-blocking background refresh
      if (hasCachedData) {
        setIntroMessage("Dane z pamięci — aktualizuję…");
      }

      // 2. Perform live location detection asynchronously with strict 3.5s timeout
      try {
        const detected = await Promise.race([
          detectUserLocation({ timeoutMs: 3000 }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Startup location timeout")), 3500))
        ]);
        
        let finalLat = detected.lat;
        let finalLng = detected.lng;
        let finalCity = detected.cityName;
        let finalMethod = detected.method;
        let finalAccuracy = detected.accuracy;

        if (!isPolandCoordinates(finalLat, finalLng)) {
          console.warn(`🚨 [Geo] GPS odrzucony jako poza Polską: lat=${finalLat}, lng=${finalLng}`);
          const fallbackLoc = await getLastValidLocationOrFallback();
          finalLat = fallbackLoc.lat;
          finalLng = fallbackLoc.lng;
          finalCity = fallbackLoc.cityName;
          finalMethod = fallbackLoc.method;
          finalAccuracy = fallbackLoc.accuracy;
        }

        console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=${finalLat}, lng=${finalLng}, miasto=${finalCity || "brak"}`);
        updateGeoDiagnostic(finalLat, finalLng, finalCity, finalMethod, finalAccuracy);
        setCustomCityName(finalCity || null);
        
        // Fetch weather for detected/fallback coordinates
        handleLocationSelected(finalLat, finalLng, finalCity, hasCachedData, false);
      } catch (err: any) {
        console.warn("Startup background location detection notice:", err?.message || err);
        if (!hasCachedData) {
          const fallbackLoc = await getLastValidLocationOrFallback();
          console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=${fallbackLoc.lat}, lng=${fallbackLoc.lng}, miasto=${fallbackLoc.cityName || "brak"}`);
          updateGeoDiagnostic(fallbackLoc.lat, fallbackLoc.lng, fallbackLoc.cityName, fallbackLoc.method, fallbackLoc.accuracy);
          setCustomCityName(fallbackLoc.cityName || null);
          handleLocationSelected(fallbackLoc.lat, fallbackLoc.lng, fallbackLoc.cityName, false, false);
        } else {
          setIsLoading(false);
        }
      }
    };
    
    startupSequence();
  }, []);

  // Automated 5-minute weather data refresh when location is selected
  useEffect(() => {
    if (!coords) return;

    const intervalId = setInterval(() => {
      console.log("Auto-refreshing weather data (5-minute timer)...");
      fetchWeather(coords.lat, coords.lng, customCityName || undefined, true, false);
    }, 300000); // 300,000 ms = 5 minutes

    return () => clearInterval(intervalId);
  }, [coords?.lat, coords?.lng, customCityName]);

  const fetchWeather = async (
    lat: number,
    lng: number,
    cityNameOverride?: string,
    isRefresh = false,
    isManual = false
  ) => {
    if (isFetchingWeatherRef.current) {
      console.log("Weather fetch already in progress, skipping duplicate call.");
      return;
    }
    isFetchingWeatherRef.current = true;

    if (isRefresh) {
      setIsRefreshing(true);
    } else if (!weatherData) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let data: WeatherResponse;
      
      if (!lat || !lng) return;
      
      console.log("📡 [App] Fetching forecast from Open-Meteo for coords:", lat, lng);
      
      const cacheKey = `weather_${lat.toFixed(2)}_${lng.toFixed(2)}`;
      const cachedRes = await cachedFetch(cacheKey, async () => {
        const getOmUrl = (mode: 'full' | 'standard' | 'minimal' = 'full') => {
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
          
          return `${baseUrl}?latitude=${lat}&longitude=${lng}&current=${currentParams}${extraParams}&hourly=${hourlyParams}&daily=${dailyParams}&forecast_days=3&timezone=auto`;
        };

        // 1. Try backend Express proxy server first with a strict 4.5-second timeout
        let serverPayload: any = null;
        try {
          const proxyController = new AbortController();
          const proxyTimeoutId = setTimeout(() => proxyController.abort(), 4500);
          const apiRes = await fetch(`/api/weather?lat=${lat}&lng=${lng}${isRefresh ? '&force=true' : ''}`, {
            signal: proxyController.signal
          });
          clearTimeout(proxyTimeoutId);

          if (apiRes.ok) {
            const json = await apiRes.json();
            if (json && (json.current || json.weather)) {
              serverPayload = json;
            }
          }
        } catch (proxyErr) {
          console.warn("⚠️ [App] Express proxy /api/weather failed or timed out, falling back to direct client fetch:", proxyErr);
        }

        let resultJson: any = null;
        if (serverPayload && serverPayload.weather) {
          resultJson = serverPayload.weather;
        } else if (serverPayload && serverPayload.current) {
          resultJson = serverPayload;
        } else {
          let omRes: Response | undefined;
          let usedUrl = getOmUrl('full');
          
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            omRes = await fetch(usedUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!omRes.ok) {
              usedUrl = getOmUrl('standard');
              const c2 = new AbortController();
              const t2 = setTimeout(() => c2.abort(), 4000);
              omRes = await fetch(usedUrl, { signal: c2.signal });
              clearTimeout(t2);
            }

            if (!omRes.ok) {
              usedUrl = getOmUrl('minimal');
              const c3 = new AbortController();
              const t3 = setTimeout(() => c3.abort(), 4000);
              omRes = await fetch(usedUrl, { signal: c3.signal });
              clearTimeout(t3);
            }
          } catch (err: any) {
            try {
              usedUrl = getOmUrl('minimal');
              const c4 = new AbortController();
              const t4 = setTimeout(() => c4.abort(), 4000);
              omRes = await fetch(usedUrl, { signal: c4.signal });
              clearTimeout(t4);
            } catch (retryErr) {
              // ignore
            }
          }
          
          if (omRes && omRes.ok) {
            resultJson = await omRes.json();
          }
        }
        return { serverPayload, omJson: resultJson };
      }, CACHE_TTLS.CURRENT_WEATHER);

      const serverPayload = cachedRes?.serverPayload;
      const omJson = cachedRes?.omJson;

      if (!omJson) {
        // Check if cached data is available in localStorage
        const cachedRaw = localStorage.getItem("aura_last_weather");
        if (cachedRaw) {
          try {
            const cachedData = JSON.parse(cachedRaw);
            if (cachedData && cachedData.weather) {
              console.log("⚠️ [App] Retrieving cached weather from localStorage after network fetch failure.");
              setWeatherData(cachedData);
              setIsLoading(false);
              setIsRefreshing(false);
              isFetchingWeatherRef.current = false;
              return;
            }
          } catch (e) {
            console.warn("Failed to parse cached weather:", e);
          }
        }
        throw new Error("Błąd pobierania danych pogodowych. Sprawdź połączenie z siecią i spróbuj ponownie.");
      }
      
      // Calculate current hour index from hourly.time
      let currentHourIdx = 0;
      if (omJson.hourly && Array.isArray(omJson.hourly.time) && omJson.hourly.time.length > 0) {
        if (omJson.current?.time) {
          const timePrefix = omJson.current.time.slice(0, 13);
          const idx = omJson.hourly.time.findIndex((t: string) => t.startsWith(timePrefix));
          if (idx >= 0) currentHourIdx = idx;
        } else {
          const now = new Date();
          const currentIsoHour = now.toISOString().slice(0, 13);
          const idx = omJson.hourly.time.findIndex((t: string) => t.startsWith(currentIsoHour));
          currentHourIdx = idx >= 0 ? idx : now.getHours();
        }
      }

      // 1. Map soil moisture: Open-Meteo returns volumetric m³/m³ (e.g. 0.265 = 26.5%)
      const rawSoilMoisture = omJson.hourly?.soil_moisture_0_to_1cm?.[currentHourIdx];
      let mappedSoilMoisture: number | undefined = undefined;
      if (typeof rawSoilMoisture === 'number') {
        mappedSoilMoisture = Math.round(rawSoilMoisture <= 1.0 ? rawSoilMoisture * 100 : rawSoilMoisture);
      }

      // 2. Map soil temperature (0cm)
      const rawSoilTemp = omJson.hourly?.soil_temperature_0cm?.[currentHourIdx];
      let mappedSoilTemp: number | undefined = undefined;
      if (typeof rawSoilTemp === 'number') {
        mappedSoilTemp = Math.round(rawSoilTemp * 10) / 10;
      }

      // 3. Map solar shortwave radiation (W/m²)
      const rawShortwaveRad = omJson.current?.shortwave_radiation ?? omJson.hourly?.shortwave_radiation?.[currentHourIdx];
      let mappedRadiation: number = typeof rawShortwaveRad === 'number'
        ? Math.round(rawShortwaveRad)
        : (omJson.current?.is_day === 0 ? 0 : Math.round((omJson.current?.uv_index || 1) * 85));

      // 4. Map surface / MSL pressure in hPa
      const rawPressure = omJson.current?.pressure_msl ?? omJson.hourly?.pressure_msl?.[currentHourIdx];
      let mappedPressure: number = Math.round(
        typeof rawPressure === 'number' ? rawPressure : 1013
      );

      if (omJson.current) {
        omJson.current.soil_moisture_satellite = mappedSoilMoisture;
        omJson.current.soil_temperature_10cm = mappedSoilTemp;
        omJson.current.shortwave_radiation = mappedRadiation;
        omJson.current.pressure_msl = mappedPressure;
      }

      // Diagnostics trace snapshot for the 5 key parameters
      const apiDiagnosticsTrace = [
        {
          paramName: "soil_moisture_0_to_1cm",
          label: "Wilgotność gleby (0-1 cm)",
          apiField: `hourly.soil_moisture_0_to_1cm[${currentHourIdx}]`,
          rawApiValue: rawSoilMoisture ?? "Brak w odpowiedzi API",
          rawApiType: typeof rawSoilMoisture === 'number' ? 'number (m³/m³)' : 'undefined',
          calculatedValue: mappedSoilMoisture !== undefined ? `${mappedSoilMoisture}%` : 'Brak danych',
          calculationFormula: "raw <= 1.0 ? Math.round(raw * 100) : raw (przeliczenie z m³/m³ na % objętości)",
          uiComponentValue: mappedSoilMoisture !== undefined ? `${mappedSoilMoisture}%` : 'Brak',
          uiRenderLocations: [
            "MainWeather.tsx (Linia 1311: <Aura Fusion 3D Top-Bar>)",
            "MainWeather.tsx (Linia 1462: <Hydro-Status / Gleba Sentinel>)",
            "AdditionalWeatherParameters.tsx (Linia 27: <Kafel Wilgotność gleby>)",
            "AgroFieldConditionsCard.tsx (Linia 42: <Stan wilgotności gleby & Retencja>)",
            "WeatherSourceComparison.tsx (Linia 90: <Porównanie Stacji Agro>)"
          ],
          status: (mappedSoilMoisture !== undefined ? 'ok' : 'warning') as 'ok' | 'warning'
        },
        {
          paramName: "shortwave_radiation",
          label: "Promieniowanie słoneczne",
          apiField: `current.shortwave_radiation / hourly.shortwave_radiation[${currentHourIdx}]`,
          rawApiValue: rawShortwaveRad ?? "Brak w odpowiedzi API",
          rawApiType: typeof rawShortwaveRad === 'number' ? 'number (W/m²)' : 'undefined',
          calculatedValue: `${mappedRadiation} W/m²`,
          calculationFormula: "Math.round(raw) (wymuszone 0 W/m² dla is_day === 0 w nocy)",
          uiComponentValue: `${mappedRadiation} W/m²`,
          uiRenderLocations: [
            "MainWeather.tsx (Linia 1489: <Helio-Atmosfera / Promieniowanie>)",
            "AdditionalWeatherParameters.tsx (Linia 26: <Kafel Promieniowanie>)",
            "AgroFieldConditionsCard.tsx (Linia 68: <Nasłonecznienie & Aktywność Fotosyntezy>)",
            "MeteoLcdConsole.tsx (Linia 112: <SOLAR RAD & Klux>)"
          ],
          status: (typeof rawShortwaveRad === 'number' ? 'ok' : 'warning') as 'ok' | 'warning'
        },
        {
          paramName: "pressure_msl",
          label: "Ciśnienie atmosferyczne (MSL)",
          apiField: `current.pressure_msl / hourly.pressure_msl[${currentHourIdx}]`,
          rawApiValue: rawPressure ?? "Brak w odpowiedzi API",
          rawApiType: typeof rawPressure === 'number' ? 'number (hPa)' : 'undefined',
          calculatedValue: `${mappedPressure} hPa`,
          calculationFormula: "Math.round(raw || 1013) (zredukowane do poziomu morza)",
          uiComponentValue: `${mappedPressure} hPa`,
          uiRenderLocations: [
            "MainWeather.tsx (Linia 1411: <Aero-Kinetyka / Barometr>)",
            "AdditionalWeatherParameters.tsx (Linia 21: <Kafel Ciśnienie>)",
            "DeviceSensorsCard.tsx (Linia 16: <Barometr cyfrowy / MSL>)",
            "MeteoLcdConsole.tsx (Linia 101: <BARO / hPa>)"
          ],
          status: (typeof rawPressure === 'number' ? 'ok' : 'warning') as 'ok' | 'warning'
        },
        {
          paramName: "temperature_2m",
          label: "Temperatura powietrza (2m)",
          apiField: `current.temperature_2m / hourly.temperature_2m[${currentHourIdx}]`,
          rawApiValue: omJson.current?.temperature_2m ?? omJson.hourly?.temperature_2m?.[currentHourIdx] ?? "Brak",
          rawApiType: typeof omJson.current?.temperature_2m === 'number' ? 'number (°C)' : 'undefined',
          calculatedValue: `${omJson.current?.temperature_2m ?? "—"}°C (w UI zaokrąglona do ${Math.round(omJson.current?.temperature_2m ?? 0)}°)`,
          calculationFormula: "Math.round(raw) na głównym ekranie, dokładna wartość w telemetrii",
          uiComponentValue: `${Math.round(omJson.current?.temperature_2m ?? 0)}°`,
          uiRenderLocations: [
            "MainWeather.tsx (Linia 1366: <Główny Termometr 3D>)",
            "MainWeather.tsx (Linia 1603: <Pasek prognozy godzinowej>)",
            "AdditionalWeatherParameters.tsx",
            "WeatherSourceComparison.tsx (Linia 200: <Porównanie modeli ICON/ECMWF/IMGW>)"
          ],
          status: (typeof omJson.current?.temperature_2m === 'number' ? 'ok' : 'warning') as 'ok' | 'warning'
        },
        {
          paramName: "apparent_temperature",
          label: "Temperatura odczuwalna",
          apiField: `current.apparent_temperature / hourly.apparent_temperature[${currentHourIdx}]`,
          rawApiValue: omJson.current?.apparent_temperature ?? omJson.hourly?.apparent_temperature?.[currentHourIdx] ?? "Brak",
          rawApiType: typeof omJson.current?.apparent_temperature === 'number' ? 'number (°C)' : 'undefined',
          calculatedValue: `${omJson.current?.apparent_temperature ?? "—"}°C (w UI zaokrąglona do ${Math.round(omJson.current?.apparent_temperature ?? 0)}°)`,
          calculationFormula: "Kombinacja temperatury 2m, wilgotności względnej (RH) i wiatru (Wind Chill / Humidex)",
          uiComponentValue: `Odczuwalna: ${Math.round(omJson.current?.apparent_temperature ?? 0)}°`,
          uiRenderLocations: [
            "MainWeather.tsx (Linia 1369: <Termometria 3D / Odczuwalna>)",
            "HeatStressTomorrowCard.tsx",
            "MeteoLcdConsole.tsx (Linia 100: <FEELS LIKE>)"
          ],
          status: (typeof omJson.current?.apparent_temperature === 'number' ? 'ok' : 'warning') as 'ok' | 'warning'
        }
      ];

      console.log("📡 [App] Open-Meteo Response Processed & Mapped:", {
        has_current: !!omJson.current,
        soil_moisture_satellite: omJson.current?.soil_moisture_satellite,
        soil_temperature_10cm: omJson.current?.soil_temperature_10cm,
        shortwave_radiation: omJson.current?.shortwave_radiation,
        pressure_msl: omJson.current?.pressure_msl,
        temperature_2m: omJson.current?.temperature_2m,
        apparent_temperature: omJson.current?.apparent_temperature
      });

      console.table(apiDiagnosticsTrace.map(d => ({
        Parametr: d.paramName,
        "Pole API": d.apiField,
        "Wartość z API": d.rawApiValue,
        "Wartość przeliczona": d.calculatedValue,
        "Wartość w UI": d.uiComponentValue
      })));

      // 3. Construct initial weather object and show UI immediately
      let resolvedCity = (cityNameOverride && isValidCityName(cityNameOverride) ? cityNameOverride.trim() : undefined) ||
        (serverPayload?.city && isValidCityName(serverPayload.city) ? serverPayload.city.trim() : undefined) ||
        (Math.abs(lat - 52.8441) < 0.05 && Math.abs(lng - 19.1772) < 0.05 ? "Lipno" : "Lokalizacja");

      data = {
        city: resolvedCity,
        lat,
        lng,
        weather: {
          ...omJson,
          activeServers: serverPayload?.activeServers || ["Open-Meteo Public API"]
        },
        apiDiagnostics: apiDiagnosticsTrace,
        imgwStation: serverPayload?.imgwStation || null,
        hydrology: serverPayload?.hydrology || null,
        airQuality: serverPayload?.airQuality || undefined,
        activeServers: serverPayload?.activeServers || ["Direct Client Fetch"]
      };

      if (isManual && cityNameOverride && isValidCityName(cityNameOverride)) {
        data.city = cityNameOverride.trim();
      }

      data.lastUpdated = new Date().toISOString();

      // Render weather immediately!
      setWeatherData(data);
      updateGeoDiagnostic(lat, lng, data.city);
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingWeatherRef.current = false;

      // Save to localStorage for instant startup next time
      try {
        const methodStr = isManual ? "manual" : "gps";
        console.log("💾 [Storage Telemetry -> Save Location State]", {
          location: "src/App.tsx:fetchWeather",
          lat,
          lng,
          city: data.city,
          method: methodStr,
          syncTime: Date.now()
        });
        localStorage.setItem("aura_last_coords", JSON.stringify({ lat, lng }));
        localStorage.setItem("aura_last_city", data.city);
        localStorage.setItem("aura_last_weather", JSON.stringify(data));
        localStorage.setItem("aura_last_sync_time", Date.now().toString());
        localStorage.setItem("aura_last_method", methodStr);
      } catch (e) {
        console.warn("Could not save to localStorage", e);
      }

      // 4. Background non-blocking enrichment for Nominatim city name, IMGW, and GIOŚ
      (async () => {
        try {
          let updatedCity = data.city;
          if (!cityNameOverride && (!isValidCityName(updatedCity) || updatedCity === "Lokalizacja" || updatedCity === "Lokalizacja GPS")) {
            const geoCity = await reverseGeocode(lat, lng);
            console.log(`📍 [Geo] Wynik reverse geocodingu: ${geoCity || "brak"}`);
            if (geoCity && isValidCityName(geoCity)) {
              updatedCity = geoCity;
            } else if (Math.abs(lat - 52.8441) < 0.05 && Math.abs(lng - 19.1772) < 0.05) {
              updatedCity = "Lipno";
            }
          }

          if (isValidCityName(updatedCity) && updatedCity !== data.city) {
            try {
              localStorage.setItem("aura_last_city", updatedCity);
            } catch (e) {}
            setWeatherData(prev => prev ? { ...prev, city: updatedCity } : prev);
          }

          // If server payload already had station/airQuality, skip client-side fetch
          if (serverPayload?.imgwStation && serverPayload?.airQuality) {
            if (updatedCity !== data.city) {
              setWeatherData(prev => prev ? { ...prev, city: updatedCity } : prev);
            }
            return;
          }

          const secTimeout = new Promise<[null, null, null]>(resolve => setTimeout(() => resolve([null, null, null]), 3500));
          const secPromise = Promise.all([
            fetchNearestImgwSynop(lat, lng).catch(() => null),
            fetchNearestImgwHydro(lat, lng).catch(() => null),
            fetchNearestGiosAirQuality(lat, lng).catch(() => null)
          ]);

          const [imgwSynop, imgwHydro, airQuality] = (await Promise.race([secPromise, secTimeout])) || [null, null, null];

          setWeatherData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              city: updatedCity !== "Lokalizacja" ? updatedCity : prev.city,
              imgwStation: imgwSynop || prev.imgwStation,
              hydrology: imgwHydro || prev.hydrology,
              airQuality: airQuality || prev.airQuality
            };
          });
        } catch (bgErr) {
          console.warn("Background weather enrichment notice:", bgErr);
        }
      })();
    } catch (err: any) {
      console.error("❌ [App] Weather fetch failed:", err);
      if (!weatherData) {
        if (!navigator.onLine) {
          setError("Jesteś offline. Sprawdź połączenie z internetem.");
        } else {
          // Display the specific error message (e.g. from Open-Meteo Status check) 
          // but wrap it in a user-friendly prefix if it's not already clear
          const msg = err.message || "Wystąpił nieoczekiwany błąd.";
          setError(msg.includes("Błąd") ? msg : `Problem techniczny: ${msg}`);
        }
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingWeatherRef.current = false;
    }
  };

  const handleLocationSelected = async (lat: number, lng: number, displayName?: string, silent = false, isManual = false) => {
    isFetchingWeatherRef.current = false;

    // Central coordinates validation
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      console.warn("🚨 [App] Invalid coordinates in handleLocationSelected:", lat, lng);
      const fallback = await getLastValidLocationOrFallback();
      lat = fallback.lat;
      lng = fallback.lng;
      displayName = fallback.cityName;
    }

    if (!isManual) {
      if (!isPolandCoordinates(lat, lng)) {
        console.warn(`🚨 [Geo] GPS odrzucony jako poza Polską: lat=${lat}, lng=${lng}`);
        const fallback = await getLastValidLocationOrFallback();
        console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=${fallback.lat}, lng=${fallback.lng}, miasto=${fallback.cityName || "brak"}`);
        lat = fallback.lat;
        lng = fallback.lng;
        displayName = fallback.cityName;
      }
    } else {
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn("🚨 [App] Manual coordinates out of global range:", lat, lng);
        return;
      }
    }

    setCoords({ lat, lng });
    if (isManual && displayName && isValidCityName(displayName)) {
      setCustomCityName(displayName.trim());
    } else if (displayName && isValidCityName(displayName)) {
      setCustomCityName(displayName.trim());
    } else {
      setCustomCityName(null);
    }
    updateGeoDiagnostic(lat, lng, displayName || "Wczytywanie...", isManual ? "Ręczny wybór" : "GPS");
    return fetchWeather(lat, lng, displayName || undefined, silent, isManual);
  };

  const handleBackToSearch = () => {
    setCoords(null);
    setCustomCityName(null);
    setWeatherData(null);
    setError(null);
  };

  const handleRefresh = () => {
    if (coords) {
      try {
        localStorage.removeItem("aura_last_weather");
      } catch (e) {
        console.warn("Could not clear localStorage on refresh", e);
      }
      fetchWeather(coords.lat, coords.lng, customCityName || undefined, true);
    }
  };

  if (isBetaExpired) {
    return (
      <AppErrorBoundary>
        <PhoneFrame>
          <BetaExpiredScreen />
        </PhoneFrame>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <PhoneFrame>
        <AnimatePresence>
          {isLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full"
            >
              <WeatherSkeleton 
                statusMessage={loadingStatus} 
                onCancel={() => {
                  setIsLoading(false);
                  isFetchingWeatherRef.current = false;
                }}
              />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              <WeatherError 
                message={error} 
                onRetry={() => {
                  if (coords) {
                    handleRefresh();
                  } else {
                    handleBackToSearch();
                  }
                }} 
                onBackToSearch={handleBackToSearch}
                onLocationSelected={handleLocationSelected}
              />
            </motion.div>
          ) : weatherData ? (
            <motion.div
              key="weather-view"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="w-full h-full"
            >
              <MainWeather
                data={weatherData}
                userLat={coords?.lat || weatherData.lat || 52.8441}
                userLng={coords?.lng || weatherData.lng || 19.1772}
                onRefresh={handleRefresh}
                onBackToSearch={handleBackToSearch}
                isRefreshing={isRefreshing}
                onLocationSelected={handleLocationSelected}
                geoDiagnostic={geoDiagnostic}
              />
            </motion.div>
          ) : (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="w-full h-full"
            >
              <IntroScreen
                onLocationSelected={handleLocationSelected}
                isLoading={isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneFrame>
      <PwaInstallPrompt />
    </AppErrorBoundary>
  );
}

