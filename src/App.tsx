import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import PhoneFrame from "./components/PhoneFrame";
import IntroScreen from "./components/IntroScreen";
import MainWeather from "./components/MainWeather";
import WeatherSkeleton from "./components/WeatherSkeleton";
import WeatherError from "./components/WeatherError";
import AppErrorBoundary from "./components/AppErrorBoundary";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import { detectUserLocation } from "./utils/geolocation";
import { GeoDiagnosticInfo } from "./components/PwaDiagnosticModal";

import { WeatherResponse } from "./types";
import { Capacitor } from '@capacitor/core';

export default function App() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [customCityName, setCustomCityName] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("Uruchamianie...");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const l = window.location;
    if (l.search[1] === '/') {
      const decoded = l.search.slice(1).split('&').map(s => s.replace(/~and~/g, '&')).join('?');
      window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
    }
  }, []);

  // Restore last cached weather on initial load and detect real GPS / IP location asynchronously
  useEffect(() => {
    if (isStartingUpRef.current) return;
    isStartingUpRef.current = true;

    const startupSequence = async () => {
      let hasCachedData = false;

      // 1. Fast path: load cache first for instant display on frame 1
      try {
        const savedCoordsStr = localStorage.getItem("aura_last_coords");
        const savedCityStr = localStorage.getItem("aura_last_city");
        const savedWeatherStr = localStorage.getItem("aura_last_weather");
        const savedTimestamp = localStorage.getItem("aura_last_sync_time");
        
        if (savedCoordsStr && savedWeatherStr) {
          const parsedCoords = JSON.parse(savedCoordsStr);
          const parsedWeather = JSON.parse(savedWeatherStr);
          const timestamp = savedTimestamp ? parseInt(savedTimestamp, 10) : 0;
          const isFresh = Date.now() - timestamp < 15 * 60 * 1000; // 15 minutes

          if (parsedCoords && typeof parsedCoords.lat === 'number' && parsedWeather) {
            setCoords(parsedCoords);
            if (savedCityStr) {
              setCustomCityName(savedCityStr);
            }
            setWeatherData(parsedWeather);
            updateGeoDiagnostic(parsedCoords.lat, parsedCoords.lng, savedCityStr || parsedWeather.city, "Pamięć Podręczna");
            if (isFresh) {
              hasCachedData = true;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load cache", e);
      }

      // If no valid cache present, show structured loading skeleton with status
      if (!hasCachedData) {
        setIsLoading(true);
        setLoadingStatus("Pobieranie lokalizacji GPS...");
      }

      // 2. Perform live location detection (GPS with IP fallback) non-blocking
      try {
        const detected = await detectUserLocation({ timeoutMs: 6000 });
        console.log("Startup location detected:", detected);
        updateGeoDiagnostic(detected.lat, detected.lng, detected.cityName, detected.method, detected.accuracy);
        setCustomCityName(detected.cityName || null);
        
        if (!hasCachedData) {
          setLoadingStatus("Pobieranie danych pogodowych...");
        }
        await handleLocationSelected(detected.lat, detected.lng, detected.cityName, hasCachedData);
      } catch (err) {
        console.warn("Startup location detection failed:", err);
        if (!hasCachedData) {
          updateGeoDiagnostic(52.2297, 21.0122, "Warszawa", "Domyślna (Brak GPS)");
          setLoadingStatus("Pobieranie danych pogodowych dla Warszawy...");
          await handleLocationSelected(52.2297, 21.0122, "Warszawa", false);
        }
      } finally {
        setIsLoading(false);
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
      
      let response;
      const isNative = Capacitor.isNativePlatform();

      if (!isNative) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s for web

          response = await fetch(`/api/weather?lat=${lat}&lng=${lng}&_t=${Date.now()}`, {
            signal: controller.signal,
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
          });
          clearTimeout(timeoutId);
        } catch (apiErr) {
          console.warn("Backend API unreachable, falling back to direct client fetch (Native or Offline mode)...", apiErr);
        }
      }

      if (response && response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          console.warn("Backend API returned non-JSON response, falling back...");
        }
      } else {
        // Fallback: Direct fetch from Open-Meteo and BigDataCloud reverse geocode client-side
        console.log("Using direct client-side Open-Meteo fallback...");
        let resolvedCity = cityNameOverride || "Lokalizacja GPS";
        if (!cityNameOverride) {
          try {
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pl`);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              resolvedCity = geoData.locality || geoData.city || geoData.principalSubdivision || "Lokalizacja GPS";
            }
          } catch (geoErr) {
            console.warn("Client reverse geocode failed:", geoErr);
          }
        }

        const clientApiKey = import.meta.env.VITE_OPENMETEO_API_KEY;
        let clientBaseUrl = clientApiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
        let clientAuthParam = clientApiKey ? `&apikey=${clientApiKey}` : "";

        let omUrl = `${clientBaseUrl}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,shortwave_radiation,direct_normal_irradiance&minutely_15=precipitation,precipitation_probability,rain,snowfall&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,precipitation_probability,precipitation,uv_index,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_temperature_0cm,evapotranspiration&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code&forecast_days=3&timezone=auto${clientAuthParam}`;
        const omController = new AbortController();
        const omTimeoutId = setTimeout(() => omController.abort(), 15000);
        let omRes = await fetch(omUrl, { signal: omController.signal });
        clearTimeout(omTimeoutId);
        
        // Fallback for invalid key or invalid parameters on client side
        if (omRes.status === 400) {
          // If we had an API key, try without it (public endpoint) and with a simpler set of parameters
          clientBaseUrl = "https://api.open-meteo.com/v1/forecast";
          clientAuthParam = "";
          omUrl = `${clientBaseUrl}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,precipitation_probability,precipitation,uv_index,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code&forecast_days=3&timezone=auto`;
          const omRetryController = new AbortController();
          const omRetryTimeoutId = setTimeout(() => omRetryController.abort(), 15000);
          omRes = await fetch(omUrl, { signal: omRetryController.signal });
          clearTimeout(omRetryTimeoutId);
        }

        if (!omRes.ok) {
          throw new Error("Nie udało się pobrać danych pogodowych ani z serwera, ani bezpośrednio z Open-Meteo.");
        }
        
        const omContentType = omRes.headers.get("content-type");
        if (!omContentType || !omContentType.includes("application/json")) {
          throw new Error("Open-Meteo zwróciło nieprawidłowy format danych (oczekiwano JSON).");
        }

        const omJson = await omRes.json();
        
        // Preserve raw cloud cover directly from Open-Meteo API without defaulting missing to 0
        if (omJson.current && typeof omJson.current.cloud_cover === 'number') {
          omJson.current.cloud_cover = Math.min(100, Math.max(0, Math.round(omJson.current.cloud_cover)));
        }

        data = {
          city: resolvedCity,
          lat,
          lng,
          weather: {
            ...omJson,
            activeServers: ["Open-Meteo Direct (Fallback)"]
          },
          activeServers: ["Open-Meteo Direct (Fallback)"]
        };
      }
      
      // Only override city name if it's an explicit manual user search
      if (isManual && cityNameOverride) {
        data.city = cityNameOverride;
      }

      data.lastUpdated = new Date().toISOString();

      setWeatherData(data);
      updateGeoDiagnostic(lat, lng, data.city);

      // Save to localStorage for instant startup next time
      try {
        localStorage.setItem("aura_last_coords", JSON.stringify({ lat, lng }));
        localStorage.setItem("aura_last_city", data.city);
        localStorage.setItem("aura_last_weather", JSON.stringify(data));
        localStorage.setItem("aura_last_sync_time", Date.now().toString());
      } catch (e) {
        console.warn("Could not save to localStorage", e);
      }
    } catch (err: any) {
      console.error(err);
      if (!weatherData) {
        if (!navigator.onLine) {
           setError("Jesteś offline. Sprawdź połączenie z internetem.");
        } else {
           setError("Wystąpił problem z połączeniem ze stacją pogodową. Spróbuj ponownie później.");
        }
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFetchingWeatherRef.current = false;
    }
  };

  const handleLocationSelected = (lat: number, lng: number, displayName?: string, silent = false, isManual = false) => {
    setCoords({ lat, lng });
    if (isManual && displayName) {
      setCustomCityName(displayName);
    } else {
      setCustomCityName(null);
    }
    updateGeoDiagnostic(lat, lng, displayName || "Wczytywanie...");
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

  return (
    <AppErrorBoundary>
      <PhoneFrame>
        <PwaInstallPrompt />
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
              <WeatherSkeleton statusMessage={loadingStatus} />
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
              <WeatherError message={error} onRetry={handleRefresh} />
            </motion.div>
          ) : weatherData ? (
            <motion.div
              key={`weather-${weatherData.city}`}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="w-full h-full"
            >
              <MainWeather
                data={weatherData}
                userLat={coords.lat}
                userLng={coords.lng}
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
    </AppErrorBoundary>
  );
}

