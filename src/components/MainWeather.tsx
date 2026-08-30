import { useRef, useState, useEffect, useMemo } from "react";
import { 
  MapPin, 
  RotateCw, 
  Search, 
  Locate,
  Compass, 
  Wind, 
  Droplets, 
  Sun, 
  Moon,
  ArrowUp, 
  ArrowDown, 
  Cloud,
  QrCode,
  CloudRain,
  Clock,
  Droplet,
  Calendar,
  Sunrise,
  Sunset,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  Thermometer,
  Activity,
  GitMerge,
  Sparkles,
  Cpu,
  Gauge,
  Tractor,
  Satellite,
  TrendingUp,
  TrendingDown,
  Layers,
  Radio,
  Sliders,
  ShieldCheck,
  Info,
  Tv,
  Globe,
  Wifi,
  Camera,
  HelpCircle,
  LayoutDashboard,
  Waves,
  Sprout,
  Settings,
  Zap
} from "lucide-react";
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import WindCompassRose from "./WindCompassRose";
import { WeatherResponse, WeatherAnalysis } from "../types";
import { 
  getWeatherMeta, 
  formatDayOfWeek, 
  getWindDirection, 
  getUvIndexDescription,
  calculateAdjustedUvIndex,
  calculateApparentTemperature,
  getCalibratedTemperature,
  getCalibratedTemperatureDetails,
  sanitizeHourCode,
  getCloudCoverLabel,
  getCityLocationString,
  getWeatherDescription,
  calculateOpticalCloudCover,
  getOpticalCloudDescription
} from "../utils/weatherUtils";
import AnimatedWeatherIcon from "./AnimatedWeatherIcon";
import AiWeatherIcon from "./AiWeatherIcon";
import AmbientWeatherEffect from "./AmbientWeatherEffect";
import WeatherAdviceCards from "./WeatherAdviceCards";
import StormRadar from "./StormRadar";
import WeatherSourceComparison from "./WeatherSourceComparison";
import SatelliteStatusCard from "./SatelliteStatusCard";
import DeviceSensorsCard from "./DeviceSensorsCard";
import DataFusionEngineModal from "./DataFusionEngineModal";
import RainAlertNowcastCard from "./RainAlertNowcastCard";
import MeteoLcdConsole from "./MeteoLcdConsole";
import QrCodeModal from "./QrCodeModal";
import CloudLayersModal from "./CloudLayersModal";
import PwaDiagnosticModal, { GeoDiagnosticInfo } from "./PwaDiagnosticModal";
import AdditionalWeatherParameters from "./AdditionalWeatherParameters";
import ApiDataFlowDiagnosticsCard from "./ApiDataFlowDiagnosticsCard";
import AuraDiagnosticCenter from "./AuraDiagnosticCenter";
import NowcastPrecipitationAlert from "./NowcastPrecipitationAlert";
import AgroFieldConditionsCard from "./AgroFieldConditionsCard";
import HeatStressTomorrowCard from "./HeatStressTomorrowCard";
import WeatherAlertsToast from "./WeatherAlertsToast";
import AirQualityCard from "./AirQualityCard";
import HydrologyCard from "./HydrologyCard";
import SavedPlacesSection from "./SavedPlacesSection";
import HourlyWeatherChart from "./HourlyWeatherChart";
import SmartWeatherAssistantCard from "./SmartWeatherAssistantCard";
import { WeatherWarningsPlaceholder } from "./WeatherWarningsPlaceholder";
import { detectUserLocation } from "../utils/geolocation";

interface MainWeatherProps {
  data: WeatherResponse;
  userLat: number;
  userLng: number;
  onRefresh: () => void;
  onBackToSearch: () => void;
  isRefreshing: boolean;
  onLocationSelected?: (lat: number, lng: number, displayName?: string, silent?: boolean, isManual?: boolean) => void;
  geoDiagnostic?: GeoDiagnosticInfo | null;
}

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

const formatUvDisplay = (val: number): string => {
  if (!Number.isFinite(val)) return '—';
  if (val > 0 && val < 1) {
    return val.toFixed(1).replace('.', ',');
  }
  return Math.round(val).toString();
};

export default function MainWeather({ data, userLat, userLng, onRefresh, onBackToSearch, isRefreshing, onLocationSelected, geoDiagnostic }: MainWeatherProps) {
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null | "all">(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [sensorLux, setSensorLux] = useState<number | null>(null);
  const [lastCameraLuminance, setLastCameraLuminance] = useState<number | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<"environment" | "user">("environment");
  const [measurementLocation, setMeasurementLocation] = useState<"indoor" | "outdoor">( () => {
    try {
      return (localStorage.getItem("aura_measurement_loc") as "indoor" | "outdoor") || "indoor";
    } catch {
      return "indoor";
    }
  });
  const [isPwaModalOpen, setIsPwaModalOpen] = useState(false);
  const [showLcdConsole, setShowLcdConsole] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [isMeasuringCameraLux, setIsMeasuringCameraLux] = useState(false);
  const [cameraLuxError, setCameraLuxError] = useState<string | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [locationToast, setLocationToast] = useState<string | null>(null);

  const handleAutoDetectLocation = async () => {
    setIsLocating(true);
    setLocationToast("Wykrywanie bieżącej pozycji GPS...");
    try {
      const loc = await detectUserLocation({ timeoutMs: 10000, allowFallback: false });
      setIsLocating(false);
      if (onLocationSelected) {
        onLocationSelected(loc.lat, loc.lng, loc.cityName, false, false);
      } else {
        onRefresh();
      }
      setLocationToast(`Pobrano pozycję GPS: ${loc.cityName || "Lokalizacja GPS"}`);
      setTimeout(() => setLocationToast(null), 4500);
    } catch (err: any) {
      console.warn("Auto detect location failed:", err);
      setIsLocating(false);
      const msg = err?.message || "Nie udało się pobrać pozycji GPS. Sprawdź uprawnienia do lokalizacji.";
      setLocationToast(msg.includes("GPS") || msg.includes("lokalizacj") ? msg : `Błąd GPS: ${msg}`);
      setTimeout(() => setLocationToast(null), 4500);
    }
  };

  const [syncSchedule, setSyncSchedule] = useState<{
    lastScheduledSync: string;
    scheduledTimes: string[];
    syncCountToday: number;
    status: string;
  } | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>("Zsynchronizowano z chmurą Google");
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [isFusionModalOpen, setIsFusionModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isDiagnosticCenterModalOpen, setIsDiagnosticCenterModalOpen] = useState(false);
  const [phoneBarometer, setPhoneBarometer] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'satellites' | 'agro' | 'diagnostics'>('satellites');
  const [selectedStationOverride, setSelectedStationOverride] = useState<{
    id: string;
    name: string;
    temp: number;
    humidity: number;
    windSpeed: number;
    pressure: number;
    distance: string;
  } | null>(null);

  const [dismissedRecs, setDismissedRecs] = useState<string[]>([]);
  const [manualCloudCover, setManualCloudCover] = useState<number | null>(null);
  const [userWeatherOverrideCode, setUserWeatherOverrideCode] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("aura_user_weather_override");
      return saved !== null && saved !== "" ? Number(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [isManualStationSelected, setIsManualStationSelected] = useState(false);

  useEffect(() => {
    if (data && data.imgwStation) {
      console.log("📍 [IMGW] Załadowano dane najbliższej stacji IMGW dla informacji:", data.imgwStation.name, "odległość:", data.imgwStation.distance);
      setSelectedStationOverride(data.imgwStation);
      setIsManualStationSelected(false);
    }
  }, [data?.imgwStation?.id, data?.lat, data?.lng]);

  useEffect(() => {
    // Detect web barometer / pressure observer
    if (typeof window !== "undefined" && "PressureObserver" in window) {
      try {
        const docAny = document as any;
        if (docAny.featurePolicy && typeof docAny.featurePolicy.allowsFeature === 'function') {
          if (!docAny.featurePolicy.allowsFeature('compute-pressure')) {
            return;
          }
        }
        if (typeof (window as any).PressureObserver === 'function') {
          const observer = new (window as any).PressureObserver((entries: any[]) => {
            for (const entry of entries) {
              if (entry && typeof entry.pressure === "number") {
                setPhoneBarometer(Math.round(entry.pressure));
              }
            }
          });
          const known = (window as any).PressureObserver.knownSources || ['cpu'];
          if (known.includes('thermals')) {
            observer.observe('thermals');
          } else if (known.includes('cpu')) {
            observer.observe('cpu');
          } else if (known.length > 0) {
            observer.observe(known[0]);
          }
        }
      } catch (e) {
        // Barometer fallback
      }
    }
  }, []);

  useEffect(() => {
    // Backend sync schedule removed in Direct Client mode
    setSyncSchedule({
      lastScheduledSync: new Date().toISOString(),
      scheduledTimes: ["Direct"],
      syncCountToday: 1,
      status: "Tryb bezpośredni (Public API)"
    });
    setCloudSyncStatus("Zsynchronizowano lokalnie (Tryb bezserwerowy)");
  }, []);

  const city = data?.city || "Twoja lokalizacja";
  const weatherObj: any = data?.weather || ((data as any)?.current ? data : null);
  const current = weatherObj?.current;

  // Helper formula to compute lux from camera pixel luminance (0..255) and location (indoor vs outdoor)
  const computeLuxFromLuminance = (luminance: number, loc: "indoor" | "outdoor") => {
    const norm = luminance / 255;
    if (loc === "outdoor") {
      return Math.round(Math.pow(norm, 2) * 45000 + 300);
    } else {
      return Math.round(Math.pow(norm, 2) * 3200 + 40);
    }
  };

  const handleToggleLocation = (newLoc: "indoor" | "outdoor") => {
    setMeasurementLocation(newLoc);
    try { localStorage.setItem("aura_measurement_loc", newLoc); } catch {}

    if (lastCameraLuminance !== null) {
      const recalculatedLux = computeLuxFromLuminance(lastCameraLuminance, newLoc);
      setSensorLux(recalculatedLux);
    }
  };

  const handleQuickCameraLuxMeasurement = async (overrideFacing?: "environment" | "user") => {
    const facing = overrideFacing || cameraFacingMode;
    if (overrideFacing) {
      setCameraFacingMode(overrideFacing);
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraLuxError("Brak dostępu do aparatu w tej przeglądarce.");
      setIsPwaModalOpen(true);
      return;
    }
    setIsMeasuringCameraLux(true);
    setCameraLuxError(null);
    try {
      let stream: MediaStream | null = null;
      if (facing === "environment") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } }
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
          });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        });
      }

      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play().catch(pErr => console.warn("Video play warning:", pErr));

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");

      setTimeout(() => {
        if (ctx && video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, 100, 100);
          const imageData = ctx.getImageData(0, 0, 100, 100);
          let totalLuminance = 0;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
          }
          const avgLuminance = totalLuminance / (100 * 100);
          setLastCameraLuminance(avgLuminance);

          const approxLux = computeLuxFromLuminance(avgLuminance, measurementLocation);
          setSensorLux(approxLux);
        } else {
          setSensorLux(measurementLocation === "outdoor" ? 18000 : 2200);
        }
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
        setIsMeasuringCameraLux(false);
      }, 1500);
    } catch (err: any) {
      setIsMeasuringCameraLux(false);
      console.warn("Camera lux measurement error:", err);
      setCameraLuxError("Przeglądarka zablokowała aparat.");
      setIsPwaModalOpen(true);
    }
  };

  const handleForceServerSync = async () => {
    setIsForceSyncing(true);
    try {
      const res = await fetch('/api/weather/force-sync', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        setSyncSchedule(d);
        onRefresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsForceSyncing(false);
    }
  };

  // Hourly forecast directly from API with safe array fallbacks
  const rawHourly = weatherObj?.hourly;
  const hourly = {
    time: Array.isArray(rawHourly?.time) ? rawHourly.time : [],
    temperature_2m: Array.isArray(rawHourly?.temperature_2m) ? rawHourly.temperature_2m : [],
    apparent_temperature: Array.isArray(rawHourly?.apparent_temperature) ? rawHourly.apparent_temperature : [],
    weather_code: Array.isArray(rawHourly?.weather_code) ? rawHourly.weather_code : [],
    precipitation: Array.isArray(rawHourly?.precipitation) ? rawHourly.precipitation : [],
    precipitation_probability: Array.isArray(rawHourly?.precipitation_probability) ? rawHourly.precipitation_probability : [],
    wind_speed_10m: Array.isArray(rawHourly?.wind_speed_10m) ? rawHourly.wind_speed_10m : [],
    wind_gusts_10m: Array.isArray(rawHourly?.wind_gusts_10m) ? rawHourly.wind_gusts_10m : [],
    wind_direction_10m: Array.isArray(rawHourly?.wind_direction_10m) ? rawHourly.wind_direction_10m : [],
    pressure_msl: Array.isArray(rawHourly?.pressure_msl) ? rawHourly.pressure_msl : [],
    uv_index: Array.isArray(rawHourly?.uv_index) ? rawHourly.uv_index : [],
    cloud_cover: Array.isArray(rawHourly?.cloud_cover) ? rawHourly.cloud_cover : [],
    cloud_cover_low: Array.isArray(rawHourly?.cloud_cover_low) ? rawHourly.cloud_cover_low : [],
    cloud_cover_mid: Array.isArray(rawHourly?.cloud_cover_mid) ? rawHourly.cloud_cover_mid : [],
    cloud_cover_high: Array.isArray(rawHourly?.cloud_cover_high) ? rawHourly.cloud_cover_high : [],
    relative_humidity_2m: Array.isArray(rawHourly?.relative_humidity_2m) ? rawHourly.relative_humidity_2m : [],
    visibility: Array.isArray(rawHourly?.visibility) ? rawHourly.visibility : [],
    shortwave_radiation: Array.isArray(rawHourly?.shortwave_radiation) ? rawHourly.shortwave_radiation : [],
    direct_normal_irradiance: Array.isArray(rawHourly?.direct_normal_irradiance) ? rawHourly.direct_normal_irradiance : [],
    is_day: Array.isArray(rawHourly?.is_day) ? rawHourly.is_day : []
  };

  // Daily forecast object directly from API with safe array fallbacks
  const todayDateStr = new Date().toISOString().split('T')[0];
  const rawDaily = weatherObj?.daily;
  const daily = {
    time: Array.isArray(rawDaily?.time) && rawDaily.time.length > 0 ? rawDaily.time : [todayDateStr],
    weather_code: Array.isArray(rawDaily?.weather_code) ? rawDaily.weather_code : [current?.weather_code ?? 0],
    temperature_2m_max: Array.isArray(rawDaily?.temperature_2m_max) ? rawDaily.temperature_2m_max : [current?.temperature_2m ?? null],
    temperature_2m_min: Array.isArray(rawDaily?.temperature_2m_min) ? rawDaily.temperature_2m_min : [current?.temperature_2m ?? null],
    apparent_temperature_max: Array.isArray(rawDaily?.apparent_temperature_max) ? rawDaily.apparent_temperature_max : [current?.apparent_temperature ?? null],
    apparent_temperature_min: Array.isArray(rawDaily?.apparent_temperature_min) ? rawDaily.apparent_temperature_min : [current?.apparent_temperature ?? null],
    uv_index_max: Array.isArray(rawDaily?.uv_index_max) ? rawDaily.uv_index_max : [current?.uv_index ?? null],
    precipitation_sum: Array.isArray(rawDaily?.precipitation_sum) ? rawDaily.precipitation_sum : [current?.precipitation ?? 0],
    precipitation_probability_max: Array.isArray(rawDaily?.precipitation_probability_max) ? rawDaily.precipitation_probability_max : [0],
    wind_speed_10m_max: Array.isArray(rawDaily?.wind_speed_10m_max) ? rawDaily.wind_speed_10m_max : [current?.wind_speed_10m ?? null],
    wind_gusts_10m_max: Array.isArray(rawDaily?.wind_gusts_10m_max) ? rawDaily.wind_gusts_10m_max : [current?.wind_gusts_10m ?? (current?.wind_speed_10m ? Math.round(current.wind_speed_10m * 1.3) : null)],
    sunrise: Array.isArray(rawDaily?.sunrise) ? rawDaily.sunrise : [],
    sunset: Array.isArray(rawDaily?.sunset) ? rawDaily.sunset : []
  };
  const isDay = current?.is_day === 1;
  const weatherMeta = getWeatherMeta(current?.weather_code ?? 0, isDay, current?.cloud_cover ?? 0, current?.precipitation ?? 0);
  const CurrentIcon = weatherMeta.icon;

  const getMatchedIndex = () => {
    try {
      if (current?.time && Array.isArray(hourly?.time)) {
        const timePrefix = current.time.slice(0, 13);
        const idx = hourly.time.findIndex((t: string) => t.startsWith(timePrefix));
        if (idx !== -1) return idx;
      }
      if (Array.isArray(hourly?.time)) {
        const nowMs = Date.now();
        let bestIdx = 0;
        let minDiff = Infinity;
        hourly.time.forEach((t: string, i: number) => {
          const diff = Math.abs(new Date(t).getTime() - nowMs);
          if (diff < minDiff) {
            minDiff = diff;
            bestIdx = i;
          }
        });
        return bestIdx;
      }
      return 0;
    } catch (e) {
      console.error("Error finding matched index:", e);
      return 0;
    }
  };

  const finalHourIndex = getMatchedIndex();
  const currentIdx = finalHourIndex !== -1 ? finalHourIndex : 0;

  console.log("[MAIN_WEATHER DEBUG]", {
    now: new Date().toISOString(),
    currentIdx,
    currentTime: current?.time,
    hourlyCurrentTime: hourly?.time?.[currentIdx],
    firstTimes: hourly?.time?.slice(0, 8)
  });

  const rawCurrentTemp = typeof current?.temperature_2m === 'number' && !isNaN(current.temperature_2m)
    ? current.temperature_2m
    : (typeof hourly?.temperature_2m?.[currentIdx] === 'number' && !isNaN(hourly.temperature_2m[currentIdx])
      ? hourly.temperature_2m[currentIdx]
      : null);

  const rawCurrentApparentTemp = typeof current?.apparent_temperature === 'number' && !isNaN(current.apparent_temperature)
    ? current.apparent_temperature
    : (typeof hourly?.apparent_temperature?.[currentIdx] === 'number' && !isNaN(hourly.apparent_temperature[currentIdx])
      ? hourly.apparent_temperature[currentIdx]
      : null);

  const currentPrecipitation = typeof current?.precipitation === 'number'
    ? current.precipitation
    : (typeof hourly.precipitation?.[currentIdx] === 'number' ? hourly.precipitation[currentIdx] : 0);

  const wCode = current?.weather_code ?? hourly.weather_code?.[currentIdx] ?? 0;

  const rawCloud = current?.cloud_cover;
  const currentCloudCover = typeof rawCloud === 'number'
    ? Math.min(100, Math.max(0, Math.round(rawCloud)))
    : (typeof hourly.cloud_cover?.[currentIdx] === 'number'
      ? Math.min(100, Math.max(0, Math.round(hourly.cloud_cover[currentIdx])))
      : 0);

  const currentPop = typeof hourly.precipitation_probability?.[currentIdx] === 'number' ? hourly.precipitation_probability[currentIdx] : null;

  const todayDatePrefix = current?.time
    ? current.time.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  // When past_days=1 is used, daily[0] is yesterday, daily[1] is today, daily[2] is tomorrow, daily[3] is day after tomorrow
  const matchedDailyTodayIdx = Array.isArray(daily?.time)
    ? daily.time.findIndex((t: string) => typeof t === 'string' && t.startsWith(todayDatePrefix))
    : -1;
  const todayDailyIndex = matchedDailyTodayIdx >= 0 ? matchedDailyTodayIdx : (daily.time.length > 1 ? 1 : 0);

  // Algorytm hybrydowy: Szansa opadów dzisiaj
  // 1. Podstawowe źródło: daily.precipitation_probability_max[todayDailyIndex]
  // 2. Wyliczenie MAX z dzisiejszych godzin w hourly.precipitation_probability
  // 3. Gdy daily = 0% lub null, a MAX z godzin > 0%, stosujemy MAX z godzin jako fallback.
  const primaryDailyPopMax = typeof daily?.precipitation_probability_max?.[todayDailyIndex] === 'number'
    ? daily.precipitation_probability_max[todayDailyIndex]
    : null;

  let hourlyMaxPopToday: number | null = null;
  if (Array.isArray(hourly?.time) && Array.isArray(hourly?.precipitation_probability)) {
    const todayHourlyPops = hourly.time
      .map((t: string, i: number) => {
        if (t.startsWith(todayDatePrefix)) {
          const val = hourly.precipitation_probability[i];
          return typeof val === 'number' && !isNaN(val) ? val : null;
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (todayHourlyPops.length > 0) {
      hourlyMaxPopToday = Math.max(...todayHourlyPops);
    }
  }

  let resolvedTodayPopMax: number | null = primaryDailyPopMax;
  let popMaxSelectionSource = `daily.precipitation_probability_max[${todayDailyIndex}]`;

  if ((primaryDailyPopMax === null || primaryDailyPopMax === 0) && hourlyMaxPopToday !== null && hourlyMaxPopToday > 0) {
    resolvedTodayPopMax = hourlyMaxPopToday;
    popMaxSelectionSource = 'MAX(hourly.precipitation_probability)';
  }
  
  // Current UV resolution: use current.uv_index; if missing, use hourly.uv_index for the current hour (0 is a valid reading)
  const rawCurrentUv = typeof current?.uv_index === 'number' ? current.uv_index : null;
  const rawHourlyUv = typeof hourly?.uv_index?.[currentIdx] === 'number' ? hourly.uv_index[currentIdx] : null;
  const rawClearSkyUv = typeof (current as any)?.uv_index_clear_sky === 'number'
    ? (current as any).uv_index_clear_sky
    : (typeof (hourly as any)?.uv_index_clear_sky?.[currentIdx] === 'number' ? (hourly as any).uv_index_clear_sky[currentIdx] : null);

  let resolvedCurrentUv: number | null = null;
  if (rawCurrentUv !== null) {
    resolvedCurrentUv = rawCurrentUv;
  } else if (rawHourlyUv !== null) {
    resolvedCurrentUv = rawHourlyUv;
  } else if (rawClearSkyUv !== null) {
    resolvedCurrentUv = calculateAdjustedUvIndex(rawClearSkyUv, currentCloudCover);
  } else {
    resolvedCurrentUv = null;
  }
  const currentUvIndex = resolvedCurrentUv;

  console.log('[UV DIAGNOSTIC]', {
    currentTime: current?.time,
    currentIdx,
    matchedHourlyTime: hourly?.time?.[currentIdx],
    currentUv: current?.uv_index,
    hourlyUv: hourly?.uv_index?.[currentIdx],
    currentClearSkyUv: (current as any)?.uv_index_clear_sky,
    hourlyClearSkyUv: (hourly as any)?.uv_index_clear_sky?.[currentIdx],
    resolvedCurrentUv: currentUvIndex
  });

  // Daily UV index max for today (used in the daily "Indeks UV" summary tile)
  const rawDailyMaxUv = typeof daily?.uv_index_max?.[todayDailyIndex] === 'number' ? daily.uv_index_max[todayDailyIndex] : null;
  const rawDailyClearSkyMaxUv = typeof (daily as any)?.uv_index_clear_sky_max?.[todayDailyIndex] === 'number' ? (daily as any).uv_index_clear_sky_max[todayDailyIndex] : null;
  const todayMaxUv = rawDailyMaxUv !== null
    ? rawDailyMaxUv
    : (rawDailyClearSkyMaxUv !== null
        ? calculateAdjustedUvIndex(rawDailyClearSkyMaxUv, currentCloudCover)
        : (currentUvIndex !== null && currentUvIndex > 0 ? currentUvIndex : null));
  const currentShortwaveRadiation = typeof current?.shortwave_radiation === 'number'
    ? current.shortwave_radiation
    : (typeof hourly?.shortwave_radiation?.[currentIdx] === 'number' ? hourly.shortwave_radiation[currentIdx] : undefined);
  const rawCurrentWindSpeed = typeof current?.wind_speed_10m === 'number' ? Math.round(current.wind_speed_10m) : (typeof hourly.wind_speed_10m?.[currentIdx] === 'number' ? Math.round(hourly.wind_speed_10m[currentIdx]) : null);
  const currentWindGusts = typeof current?.wind_gusts_10m === 'number' 
    ? Math.round(current.wind_gusts_10m) 
    : (typeof hourly.wind_gusts_10m?.[currentIdx] === 'number' 
        ? Math.round(hourly.wind_gusts_10m[currentIdx]) 
        : (typeof (daily as any)?.wind_gusts_10m_max?.[todayDailyIndex] === 'number' 
            ? Math.round((daily as any).wind_gusts_10m_max[todayDailyIndex]) 
            : (rawCurrentWindSpeed !== null ? Math.round(rawCurrentWindSpeed * 1.3) : null)));
  const todayMaxGusts = typeof daily?.wind_gusts_10m_max?.[todayDailyIndex] === 'number'
    ? Math.round(daily.wind_gusts_10m_max[todayDailyIndex])
    : (typeof daily?.wind_speed_10m_max?.[todayDailyIndex] === 'number'
        ? Math.round(daily.wind_speed_10m_max[todayDailyIndex] * 1.3)
        : currentWindGusts);
  const currentWindDirection = current?.wind_direction_10m ?? hourly.wind_direction_10m?.[currentIdx] ?? 0;
  const rawCurrentHumidity = typeof current?.relative_humidity_2m === 'number' ? Math.round(current.relative_humidity_2m) : (typeof hourly.relative_humidity_2m?.[currentIdx] === 'number' ? Math.round(hourly.relative_humidity_2m[currentIdx]) : null);
  const rawCurrentPressure = typeof current?.pressure_msl === 'number' ? Math.round(current.pressure_msl) : (typeof hourly.pressure_msl?.[currentIdx] === 'number' ? Math.round(hourly.pressure_msl[currentIdx]) : null);

  // IMGW Ground-Truth Station logic: Prioritize IMGW telemetry station if within reliable range (<= 45km)
  const isImgwReliable = data?.imgwStation && typeof data.imgwStation.temp === 'number' && !isNaN(data.imgwStation.temp) && (data.imgwStation.distanceKm === undefined || data.imgwStation.distanceKm <= 45);
  const activeStation = selectedStationOverride || (isImgwReliable ? data?.imgwStation : null);

  // Dynamic Calibration (Bias Correction):
  const calibrationDetails = getCalibratedTemperatureDetails(
    activeStation,
    rawCurrentTemp,
    hourly?.time,
    hourly?.temperature_2m
  );

  const isUsingImgw = Boolean(activeStation && calibrationDetails.isCalibrated);
  const currentTemp = calibrationDetails.calibratedTemp !== null ? calibrationDetails.calibratedTemp : rawCurrentTemp;
  const tempBias = calibrationDetails.bias;

  const stTemp = activeStation?.temp;
  const stHumidity = activeStation?.humidity;
  const stWind = activeStation?.windSpeed;
  const stPressure = activeStation?.pressure || rawCurrentPressure;
  const stApparentTemp = (activeStation as any)?.apparentTemp ?? (activeStation as any)?.apparent_temperature ?? (activeStation as any)?.feelsLike ?? null;

  const currentHumidityForApparent = (activeStation && typeof stHumidity === 'number' && !isNaN(stHumidity))
    ? Math.round(stHumidity)
    : rawCurrentHumidity;

  const currentWindSpeedForApparent = (activeStation && typeof stWind === 'number' && !isNaN(stWind))
    ? Math.round(stWind)
    : rawCurrentWindSpeed;

  const calculatedStApparentTemp = (typeof currentTemp === 'number' && currentHumidityForApparent !== null && currentWindSpeedForApparent !== null)
    ? calculateApparentTemperature(currentTemp, currentHumidityForApparent, currentWindSpeedForApparent, currentWindGusts)
    : null;

  const currentApparentTemp = (activeStation && typeof stApparentTemp === 'number' && !isNaN(stApparentTemp))
    ? stApparentTemp
    : (calculatedStApparentTemp !== null ? calculatedStApparentTemp : rawCurrentApparentTemp);

  // Wskaźnik porównawczy: różnica temperatury w stosunku do wczoraj o tej samej porze (past_days=1)
  const yesterdayIndex = currentIdx >= 24 ? currentIdx - 24 : -1;
  const yesterdayTemp = (yesterdayIndex >= 0 && typeof hourly?.temperature_2m?.[yesterdayIndex] === 'number')
    ? hourly.temperature_2m[yesterdayIndex]
    : null;
  const tempDiffYesterday = (currentTemp !== null && yesterdayTemp !== null)
    ? Number((currentTemp - yesterdayTemp).toFixed(1))
    : null;

  const getNext24HoursFromIndex = (startIndex: number) => {
    return Array.from({ length: 24 }).map((_, i) => {
      const idx = startIndex + i;
      if (idx >= hourly.time.length) return null;
      
      const timeStr = hourly.time[idx];
      const rawHourTemp = hourly.temperature_2m[idx];
      // Kalibracja wykresu godzinnego: stała korekta Bias dla całej krzywej
      const calibratedHourTemp = (typeof rawHourTemp === 'number' && !isNaN(rawHourTemp))
        ? (calibrationDetails.isCalibrated ? Number((rawHourTemp + tempBias).toFixed(1)) : rawHourTemp)
        : null;

      const temp = (i === 0 && currentTemp !== null) ? currentTemp : (calibratedHourTemp ?? rawHourTemp);
      const code = hourly.weather_code[idx] ?? 0;
      const hourLabel = new Date(timeStr).toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit"
      });

      const pop = (hourly.precipitation_probability && typeof hourly.precipitation_probability[idx] === 'number') 
        ? hourly.precipitation_probability[idx] 
        : 0;
      const rawHourCloud = (hourly.cloud_cover && typeof hourly.cloud_cover[idx] === 'number')
        ? hourly.cloud_cover[idx]
        : 0;
      const hourLow = typeof hourly.cloud_cover_low?.[idx] === 'number' ? hourly.cloud_cover_low[idx] : null;
      const hourMid = typeof hourly.cloud_cover_mid?.[idx] === 'number' ? hourly.cloud_cover_mid[idx] : null;
      const hourHigh = typeof hourly.cloud_cover_high?.[idx] === 'number' ? hourly.cloud_cover_high[idx] : null;

      const precip = (hourly.precipitation && typeof hourly.precipitation[idx] === 'number')
        ? hourly.precipitation[idx]
        : 0;

      const opticalHourCloud = calculateOpticalCloudCover(hourLow, hourMid, hourHigh, rawHourCloud);
      const cloudCover = opticalHourCloud;

      const hourMeta = getWeatherMeta(code, isDay, opticalHourCloud, precip, undefined, undefined, { low: hourLow, mid: hourMid, high: hourHigh, total: rawHourCloud });
      const HourIcon = hourMeta.icon;
      const hourWind = (hourly.wind_speed_10m && typeof hourly.wind_speed_10m[idx] === 'number') ? hourly.wind_speed_10m[idx] : 0;
      const hourGust = (hourly.wind_gusts_10m && typeof hourly.wind_gusts_10m[idx] === 'number') ? hourly.wind_gusts_10m[idx] : Math.round(hourWind * 1.3);
      const hourHum = (hourly.relative_humidity_2m && typeof hourly.relative_humidity_2m[idx] === 'number') ? hourly.relative_humidity_2m[idx] : 50;
      const hourCalibratedApparent = (typeof temp === 'number') ? calculateApparentTemperature(temp, hourHum, hourWind, hourGust) : null;
      const apparentTemp = (i === 0 && currentApparentTemp !== null)
        ? currentApparentTemp
        : (hourCalibratedApparent ?? ((hourly.apparent_temperature && typeof hourly.apparent_temperature[idx] === 'number') 
            ? (calibrationDetails.isCalibrated ? Number((hourly.apparent_temperature[idx] + tempBias).toFixed(1)) : hourly.apparent_temperature[idx])
            : null));
      const windSpeed = (hourly.wind_speed_10m && typeof hourly.wind_speed_10m[idx] === 'number')
        ? Math.round(hourly.wind_speed_10m[idx])
        : null;
      const windGusts = (hourly.wind_gusts_10m && typeof hourly.wind_gusts_10m[idx] === 'number')
        ? Math.round(hourly.wind_gusts_10m[idx])
        : (windSpeed !== null ? Math.round(windSpeed * 1.3) : null);

      return {
        timeStr,
        hourLabel,
        temp,
        apparentTemp,
        windSpeed,
        windGusts,
        code,
        HourIcon,
        pop,
        cloudCover,
        precip
      };
    }).filter(item => item !== null);
  };

  const getNext24Hours = () => {
    try {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      
      const startIndex = hourly.time.findIndex((t: string) => {
        const tDate = new Date(t);
        return tDate.getTime() === now.getTime();
      });
      
      if (startIndex === -1) {
        const fallbackIndex = hourly.time.findIndex((t: string) => new Date(t) >= now);
        if (fallbackIndex === -1) return [];
        return getNext24HoursFromIndex(fallbackIndex);
      }

      return getNext24HoursFromIndex(startIndex);
    } catch (e) {
      console.error("Error slicing hourly forecast:", e);
      return [];
    }
  };

  const next24Hours = getNext24Hours();

  const currentHumidity = (activeStation && typeof stHumidity === 'number' && !isNaN(stHumidity))
    ? Math.round(stHumidity)
    : rawCurrentHumidity;

  const currentWindSpeed = (activeStation && typeof stWind === 'number' && !isNaN(stWind))
    ? Math.round(stWind)
    : rawCurrentWindSpeed;

  const currentPressure = phoneBarometer 
    ? phoneBarometer
    : stPressure;

  const discomfortIndex = (currentTemp !== null && currentHumidity !== null)
    ? Number((currentTemp - 0.55 * (1 - 0.01 * currentHumidity) * (currentTemp - 14.4)).toFixed(1))
    : null;

  const calculateLuxCloudCover = (lux: number, isDaytime: boolean, loc: "indoor" | "outdoor") => {
    if (!isDaytime) return null;

    let cloudCover: number;
    let label: string;
    let icon: string;

    if (loc === "indoor") {
      const effectiveLux = lux * 2.5;
      const factor = Math.min(1, Math.max(0, (effectiveLux - 200) / (7500 - 200)));
      cloudCover = Math.round((1 - factor) * 100);
    } else {
      const factor = Math.min(1, Math.max(0, (lux - 300) / (32000 - 300)));
      cloudCover = Math.round((1 - factor) * 100);
    }

    if (cloudCover <= 10) {
      label = loc === "indoor" ? "Bezchmurnie (Fotometr za szybą)" : "Pełne słońce w plenerze";
      icon = "☀️";
    } else if (cloudCover <= 40) {
      label = loc === "indoor" ? "Przejaśnienia za szybą" : "Jasno i słonecznie (Fotometr)";
      icon = "⛅";
    } else if (cloudCover <= 70) {
      label = loc === "indoor" ? "Umiarkowane zachmurzenie za szybą" : "Gęste chmury (Fotometr)";
      icon = "⛅";
    } else {
      label = loc === "indoor" ? "Pochmurno / Cień za szybą" : "Ciemne chmury (Fotometr)";
      icon = "☁️";
    }

    return { cloudCover, label, icon };
  };


  const lowCloud = typeof hourly.cloud_cover_low?.[currentIdx] === 'number'
    ? hourly.cloud_cover_low[currentIdx]
    : (typeof current?.cloud_cover_low === 'number' ? current.cloud_cover_low : 0);
  const midCloud = typeof hourly.cloud_cover_mid?.[currentIdx] === 'number'
    ? hourly.cloud_cover_mid[currentIdx]
    : (typeof current?.cloud_cover_mid === 'number' ? current.cloud_cover_mid : 0);
  const highCloud = typeof hourly.cloud_cover_high?.[currentIdx] === 'number'
    ? hourly.cloud_cover_high[currentIdx]
    : (typeof current?.cloud_cover_high === 'number' ? current.cloud_cover_high : 0);

  const opticalCloudCover = calculateOpticalCloudCover(lowCloud, midCloud, highCloud, currentCloudCover);
  const opticalCloudLabel = getOpticalCloudDescription(opticalCloudCover);

  let wyswietlaneZachmurzenie = manualCloudCover !== null 
    ? manualCloudCover 
    : opticalCloudCover;

  const calibratedNext24Hours = useMemo(() => {
    return next24Hours.map((hour, idx) => {
      if (!hour) return null;
      return {
        ...hour,
        cloudCover: idx === 0 ? wyswietlaneZachmurzenie : hour.cloudCover
      };
    }).filter(Boolean);
  }, [next24Hours, wyswietlaneZachmurzenie]);

  const todayMaxTemp = useMemo(() => {
    try {
      const teraz = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dzis = `${teraz.getFullYear()}-${pad(teraz.getMonth() + 1)}-${pad(teraz.getDate())}`;
      
      if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
        const dzisiejszeTempy = hourly.time
          .map((t: string, i: number) => ({ t, temp: hourly.temperature_2m[i] }))
          .filter((item: any) => item.t.startsWith(dzis) && typeof item.temp === 'number')
          .map((item: any) => item.temp);

        if (dzisiejszeTempy.length > 0) {
          return Math.max(...dzisiejszeTempy);
        }
      }
      return daily.temperature_2m_max?.[todayDailyIndex] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_max?.[todayDailyIndex] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp, todayDailyIndex]);

  const todayMinTemp = useMemo(() => {
    try {
      const teraz = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dzis = `${teraz.getFullYear()}-${pad(teraz.getMonth() + 1)}-${pad(teraz.getDate())}`;
      
      if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
        const dzisiejszeTempy = hourly.time
          .map((t: string, i: number) => ({ t, temp: hourly.temperature_2m[i] }))
          .filter((item: any) => item.t.startsWith(dzis) && typeof item.temp === 'number')
          .map((item: any) => item.temp);

        if (dzisiejszeTempy.length > 0) {
          return Math.min(...dzisiejszeTempy);
        }
      }
      return daily.temperature_2m_min?.[todayDailyIndex] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_min?.[todayDailyIndex] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp, todayDailyIndex]);

  const upcomingNightTemp = useMemo(() => {
    try {
      if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
        const now = new Date();
        const currentIsoHour = now.toISOString().slice(0, 13);
        const curIdx = hourly.time.findIndex((t: string) => t.startsWith(currentIsoHour));
        const startIdx = curIdx !== -1 ? curIdx : 0;
        
        const nightTemps: number[] = [];
        for (let i = startIdx; i < Math.min(hourly.time.length, startIdx + 24); i++) {
          const timeStr = hourly.time[i];
          const hourVal = parseInt(timeStr.slice(11, 13), 10);
          if (hourVal >= 22 || hourVal <= 6) {
            if (typeof hourly.temperature_2m[i] === 'number') {
              nightTemps.push(hourly.temperature_2m[i]);
            }
          }
        }
        if (nightTemps.length > 0) {
          return Math.min(...nightTemps);
        }
      }
      return daily.temperature_2m_min?.[todayDailyIndex] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_min?.[todayDailyIndex] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp, todayDailyIndex]);

  // Early return ONLY after ALL hooks have been unconditionally called
  if (!weatherObj || !current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center text-slate-300">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-3xl mb-4">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Brak aktualnych danych pogodowych</h3>
        <p className="text-sm text-slate-400 max-w-xs mb-6">
          Nie udało się wczytać telemetrii dla tej lokalizacji. Odśwież połączenie ze stacją.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            onClick={onRefresh}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież dane
          </button>
          <button
            onClick={onBackToSearch}
            className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-slate-200 font-medium rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            Zmień miasto
          </button>
        </div>
      </div>
    );
  }

  // Find index of the current hour using the specific logic requested by the user
  const getCloudCoverLabel = (pct: number) => {
    if (pct < 10) return "Bezchmurnie";
    if (pct <= 40) return "Przejaśnienia / Lekkie chmury";
    if (pct < 60) return "Umiarkowane";
    if (pct < 90) return "Duże";
    return "Pochmurno";
  };

  const getWindDirection = (deg: number) => {
    const directions = ["Północny (N)", "Północno-Wschodni (NE)", "Wschodni (E)", "Południowo-Wschodni (SE)", "Południowy (S)", "Południowo-Zachodni (SW)", "Zachodni (W)", "Północno-Zachodni (NW)"];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const getDiscomfortDetails = (di: number | null) => {
    if (di === null || isNaN(di)) return { label: "Brak danych", color: "text-slate-400", bg: "bg-slate-500/20", border: "border-slate-500/30", barColor: "bg-slate-500", desc: "Brak wystarczających danych do obliczenia wskaźnika." };
    if (di < 21) return { label: "Komfortowo", color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30", barColor: "bg-emerald-500", desc: "Przyjemne warunki termiczne bez odczucia duszności." };
    if (di < 25) return { label: "Ciepło / Lekki dyskomfort", color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30", barColor: "bg-amber-500", desc: "Zauważalne ciepło, warto zadbać o nawodnienie." };
    if (di < 30) return { label: "Duszno i parno", color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/30", barColor: "bg-orange-500", desc: "Podwyższona wilgotność i temperatura. Możliwe uczucie duszności." };
    return { label: "Ekstremalny upał i duszność", color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30", barColor: "bg-red-500", desc: "Bardzo wysoki stres termiczny! Unikaj wysiłku na słońcu." };
  };
  const discomfortMeta = getDiscomfortDetails(discomfortIndex);

  const getWindDirectionText = (deg: number) => {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round((deg % 360) / 22.5);
    return directions[index % 16];
  };

  let isLuxClamped = false;

  const activeCloudCover = wyswietlaneZachmurzenie;
  const currentWeatherMeta = getWeatherMeta(
    wCode, 
    isDay, 
    opticalCloudCover, 
    currentPrecipitation, 
    currentShortwaveRadiation, 
    userWeatherOverrideCode ?? undefined,
    { low: lowCloud, mid: midCloud, high: highCloud, total: currentCloudCover }
  );

  const isPrecipitatingOrStorm = currentPrecipitation > 0.05 || (currentWeatherMeta.code >= 50 && currentWeatherMeta.code <= 99);
  // Removed luxCloudRes usage as requested
  let displayOpis = currentWeatherMeta.text;
  let displayIkonka = currentWeatherMeta.emoji;

  const windDirText = getWindDirectionText(typeof currentWindDirection === 'number' ? currentWindDirection : 0);
  const indoorHumidity = Math.min(99, Math.max(20, Math.round(currentHumidity * 0.95 + 2)));
  
  // Realistic cloud ceiling estimate based on weather conditions and layers
  let cloudCeiling = 1200;
  if (wyswietlaneZachmurzenie <= 5 || currentCloudCover <= 5 || wCode === 0) {
    cloudCeiling = 12192; // Unlimited / high troposphere limit matching commercial apps for clear skies
  } else if (wCode <= 2 && wyswietlaneZachmurzenie < 50) {
    cloudCeiling = Math.round(1400 + (currentTemp * 30) - (currentHumidity * 5));
  } else if (lowCloud > 15) {
    cloudCeiling = Math.round(20 * (100 - currentHumidity) + 300);
  } else if (midCloud > 15) {
    cloudCeiling = Math.round(2500 + (100 - currentHumidity) * 20);
  } else if (highCloud > 10) {
    cloudCeiling = Math.round(7000 + (currentTemp * 12) - (currentHumidity * 8));
  } else if (currentCloudCover > 0) {
    cloudCeiling = Math.max(800, Math.round(35 * (100 - currentHumidity)));
  }
  
  // Visibility from API
  const visibilityFromApi = current?.visibility ?? hourly.visibility?.[currentIdx];
  let rawVisKm = visibilityFromApi ? Math.round(visibilityFromApi / 1000) : 20;
  // If no fog (wCode 40-49), no rain, and humidity <= 92%, clear air visibility should be realistic (at least 15-30km)
  const isFogOrRain = (wCode >= 40 && wCode <= 49) || currentPrecipitation > 0 || rawCurrentHumidity > 92;
  if (!isFogOrRain && rawVisKm < 10) {
    rawVisKm = Math.round(18 + (100 - wyswietlaneZachmurzenie) * 0.12);
  }
  const visibilityKm = rawVisKm;

  // UV index from meteo source (using current UV without zeroing by is_day)
  let displayUv = "Brak danych";
  let uvVal = 0;
  if (currentUvIndex !== null && typeof currentUvIndex === 'number') {
    uvVal = Math.max(0, currentUvIndex);
    const uvOpis = getUvIndexDescription(uvVal);
    displayUv = `${formatUvDisplay(uvVal)} — ${uvOpis}`;
    console.log('[UV DISPLAY]', { raw: uvVal, displayed: formatUvDisplay(uvVal) });
  }

  // Recommendations logic
  const recommendations = [];
  if (currentTemp >= 25) {
    recommendations.push({
      id: 'heat',
      type: 'UPAŁ',
      icon: '☀️',
      text: `Wariacie, leje się z nieba! ${currentTemp}°C na termometrze. Pij dużo wody i unikaj słońca w środku dnia.`,
      color: 'bg-amber-500/10 border-amber-500/30'
    });
  }
  if (uvVal >= 3) {
    recommendations.push({
      id: 'uv',
      type: 'OCHRONA UV',
      icon: '🧴',
      text: `Mocne słońce! Dzisiejszy indeks UV to ${uvVal.toFixed(1)}. Krem z filtrem i nakrycie głowy obowiązkowe.`,
      color: 'bg-indigo-500/10 border-indigo-500/30'
    });
  }
  if (currentPop > 40 || (wCode >= 51 && wCode <= 67)) {
    recommendations.push({
      id: 'rain',
      type: 'DESZCZ',
      icon: '☂️',
      text: 'Mokre klimaty! Weź parasol, bo zanosi się na konkretny opad.',
      color: 'bg-cyan-500/10 border-cyan-500/30'
    });
  }

  const activeRecs = recommendations.filter(r => !dismissedRecs.includes(r.id));

  const getHourlyForDay = (targetDayStr: string) => {
    try {
      const datePrefix = targetDayStr.slice(0, 10);
      return hourly.time
        .map((t, idx) => {
          const pop = (hourly.precipitation_probability && typeof hourly.precipitation_probability[idx] === 'number') ? hourly.precipitation_probability[idx] : 0;
          const rawHourCloud = (hourly.cloud_cover && typeof hourly.cloud_cover[idx] === 'number') ? hourly.cloud_cover[idx] : 0;
          const hLow = typeof hourly.cloud_cover_low?.[idx] === 'number' ? hourly.cloud_cover_low[idx] : null;
          const hMid = typeof hourly.cloud_cover_mid?.[idx] === 'number' ? hourly.cloud_cover_mid[idx] : null;
          const hHigh = typeof hourly.cloud_cover_high?.[idx] === 'number' ? hourly.cloud_cover_high[idx] : null;
          const precip = (hourly.precipitation && typeof hourly.precipitation[idx] === 'number') ? hourly.precipitation[idx] : 0;
          const code = hourly.weather_code[idx] ?? 0;

          const cloudCover = calculateOpticalCloudCover(hLow, hMid, hHigh, rawHourCloud);

          const apparentTemp = (hourly.apparent_temperature && typeof hourly.apparent_temperature[idx] === 'number')
            ? hourly.apparent_temperature[idx]
            : null;
          const windSpeed = (hourly.wind_speed_10m && typeof hourly.wind_speed_10m[idx] === 'number')
            ? Math.round(hourly.wind_speed_10m[idx])
            : null;
          const windGusts = (hourly.wind_gusts_10m && typeof hourly.wind_gusts_10m[idx] === 'number')
            ? Math.round(hourly.wind_gusts_10m[idx])
            : (windSpeed !== null ? Math.round(windSpeed * 1.3) : null);

          return {
            timeStr: t,
            hourLabel: new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
            temp: hourly.temperature_2m[idx],
            apparentTemp,
            windSpeed,
            windGusts,
            code,
            pop,
            cloudCover,
            precip
          };
        })
        .filter(item => item.timeStr.startsWith(datePrefix));
    } catch (e) {
      return [];
    }
  };

  // Calculate 7-day temperature range for relative scale bars
  const globalMinTemp = Array.isArray(daily?.temperature_2m_min) && daily.temperature_2m_min.length > 0 
    ? Math.min(...daily.temperature_2m_min.filter((t): t is number => typeof t === 'number'))
    : 0;
  const globalMaxTemp = Array.isArray(daily?.temperature_2m_max) && daily.temperature_2m_max.length > 0
    ? Math.max(...daily.temperature_2m_max.filter((t): t is number => typeof t === 'number'))
    : 30;
  const globalTempRange = Math.max(1, (isFinite(globalMaxTemp) ? globalMaxTemp : 30) - (isFinite(globalMinTemp) ? globalMinTemp : 0));

  // Dynamic Background & Lighting gradient calculation based on weather code and time of day (day / sunset / night / rain / storm / snow)
  const currentHour = new Date().getHours();
  let isSunsetTime = false;
  const rawSunset = daily?.sunset?.[todayDailyIndex];
  if (rawSunset && typeof rawSunset === 'string') {
    const sunsetDate = new Date(rawSunset);
    if (!isNaN(sunsetDate.getTime())) {
      const diffMinutes = (sunsetDate.getTime() - Date.now()) / (1000 * 60);
      if (diffMinutes >= -45 && diffMinutes <= 60) {
        isSunsetTime = true;
      }
    }
  } else {
    isSunsetTime = currentHour >= 18 && currentHour <= 21;
  }

  // Determine atmospheric background gradient & lighting orbs
  const isStormy = wCode >= 95 && wCode <= 99;
  const isRainy = (wCode >= 51 && wCode <= 67) || (wCode >= 80 && wCode <= 82) || currentPrecipitation > 0.2;
  const isSnowy = (wCode >= 71 && wCode <= 77) || (wCode >= 85 && wCode <= 86);
  const isCloudyWeather = wyswietlaneZachmurzenie >= 70 || wCode === 3 || wCode === 45 || wCode === 48;

  let bgGradientClass = "from-[#070e22] via-[#0c1b3c] to-[#080d20]";
  let orbPrimaryColor = "bg-blue-500/20";
  let orbSecondaryColor = "bg-cyan-500/15";
  let orbAccentColor = "bg-sky-400/10";

  if (isStormy) {
    // Burza: ciemny fiolet / grafit / elektryczny indygo
    bgGradientClass = "from-[#080918] via-[#140e2b] to-[#090a16]";
    orbPrimaryColor = "bg-purple-600/25";
    orbSecondaryColor = "bg-indigo-500/20";
    orbAccentColor = "bg-violet-400/15";
  } else if (isSunsetTime) {
    // Zachód słońca: granat + magenta + złoty blask
    bgGradientClass = "from-[#090b24] via-[#1e113a] to-[#0f0924]";
    orbPrimaryColor = "bg-purple-500/30";
    orbSecondaryColor = "bg-rose-500/20";
    orbAccentColor = "bg-amber-500/20";
  } else if (isRainy) {
    // Deszcz: głęboki morski granat + chłodny cyjan
    bgGradientClass = "from-[#061224] via-[#0b203c] to-[#06162a]";
    orbPrimaryColor = "bg-cyan-600/20";
    orbSecondaryColor = "bg-blue-600/20";
    orbAccentColor = "bg-teal-500/15";
  } else if (isSnowy) {
    // Śnieg / Mróz: lodowy błękit + głęboki szafir
    bgGradientClass = "from-[#071328] via-[#10234a] to-[#091632]";
    orbPrimaryColor = "bg-sky-400/20";
    orbSecondaryColor = "bg-indigo-400/15";
    orbAccentColor = "bg-blue-300/15";
  } else if (!isDay) {
    // Noc: aksamitna czerń + głęboki granat i gwiezdny fiolet
    bgGradientClass = "from-[#030614] via-[#080e29] to-[#050818]";
    orbPrimaryColor = "bg-indigo-600/20";
    orbSecondaryColor = "bg-blue-600/15";
    orbAccentColor = "bg-purple-500/10";
  } else if (isCloudyWeather) {
    // Pochmurno w dzień: stalowy błękit + chłodny grafit
    bgGradientClass = "from-[#081226] via-[#12203a] to-[#091428]";
    orbPrimaryColor = "bg-slate-400/15";
    orbSecondaryColor = "bg-blue-500/15";
    orbAccentColor = "bg-indigo-400/10";
  } else {
    // Słoneczny dzień: głęboki błękit nieba + lazurowy blask
    bgGradientClass = "from-[#061332] via-[#0c285e] to-[#081738]";
    orbPrimaryColor = "bg-blue-500/25";
    orbSecondaryColor = "bg-sky-400/20";
    orbAccentColor = "bg-amber-400/15";
  }

  return (
    <div className={`flex flex-col min-h-screen bg-gradient-to-b ${bgGradientClass} overflow-x-hidden text-slate-100 transition-colors duration-1000 relative selection:bg-blue-500/30 selection:text-white`}>
      {/* Dynamic atmospheric glowing orbs */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.18, 1],
            opacity: [0.2, 0.32, 0.2],
            x: [0, 25, 0],
            y: [0, -25, 0]
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute -top-36 -left-36 w-[500px] h-[500px] ${orbPrimaryColor} rounded-full blur-[130px]`}
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.25, 1],
            opacity: [0.15, 0.26, 0.15],
            x: [0, -35, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className={`absolute top-1/4 -right-40 w-[550px] h-[550px] ${orbSecondaryColor} rounded-full blur-[140px]`}
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.22, 0.1]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className={`absolute top-2/3 left-1/4 w-96 h-96 ${orbAccentColor} rounded-full blur-[120px]`}
        />
      </div>

      {/* Ambient weather effects (rain, snow, sun, clouds, stars) */}
      <AmbientWeatherEffect weatherCode={current?.weather_code ?? wCode} isDay={isDay} cloudCover={wyswietlaneZachmurzenie} />

      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 pb-40 z-10 scroll-smooth">
        {/* Location Detection Notification Toast */}
        <AnimatePresence>
          {locationToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="mb-4 p-3.5 bg-blue-900/85 border border-blue-400/50 backdrop-blur-2xl rounded-2xl text-white text-xs font-semibold shadow-2xl flex items-center justify-between"
            >
              <div className="flex items-center space-x-2.5">
                <Locate className="w-4 h-4 text-cyan-300 animate-pulse" />
                <span>{locationToast}</span>
              </div>
              <button 
                onClick={() => setLocationToast(null)}
                className="text-slate-300 hover:text-white ml-2 text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Control Bar with Glassmorphic Actions */}
        <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto mb-4">
          {/* Left Controls: Search & GPS */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={onBackToSearch}
              className="p-3 bg-white/[0.06] hover:bg-white/[0.12] active:bg-white/[0.18] border border-white/12 rounded-2xl text-slate-100 hover:text-white transition-all active:scale-95 shadow-lg backdrop-blur-xl cursor-pointer flex items-center justify-center"
              title="Wyszukaj miejscowość z listy"
              id="btn-back-to-search"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-200" />
            </button>
            <button
              onClick={handleAutoDetectLocation}
              disabled={isLocating}
              className="p-3 bg-blue-500/20 hover:bg-blue-500/30 active:bg-blue-500/40 border border-blue-400/30 rounded-2xl text-blue-300 hover:text-white transition-all active:scale-95 shadow-lg backdrop-blur-xl cursor-pointer flex items-center justify-center relative overflow-hidden"
              title="Wykryj moją automatyczną lokalizację (GPS / IP)"
              id="btn-auto-detect-gps"
            >
              {isLocating ? (
                <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-cyan-300" />
              ) : (
                <Locate className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300" />
              )}
            </button>
          </div>

          {/* Right Controls: Diagnostic Center, LCD, QR, Refresh */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            <button
              onClick={() => setIsDiagnosticCenterModalOpen(true)}
              className="p-2.5 sm:p-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 rounded-2xl text-purple-200 hover:text-white transition-all active:scale-95 shadow-lg backdrop-blur-xl cursor-pointer flex items-center justify-center gap-1.5 font-bold text-xs"
              title="Otwórz Centrum Diagnostyczne Aury"
              id="btn-open-diagnostic-center"
            >
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300 shrink-0" />
              <span className="hidden lg:inline font-mono">Diagnostyka</span>
            </button>

            <button
              onClick={() => setShowLcdConsole(!showLcdConsole)}
              className={`p-2.5 sm:p-3 border rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 font-extrabold text-xs shadow-lg backdrop-blur-xl cursor-pointer ${
                showLcdConsole 
                  ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-amber-500/30" 
                  : "bg-white/[0.06] hover:bg-white/[0.12] text-amber-300 border-white/12"
              }`}
              title="Przełącz tryb widoku: [Tryb: Nowoczesny] / [Tryb: Konsola LCD]"
              id="btn-toggle-lcd-console"
            >
              <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
              <span className="hidden md:inline font-mono">{showLcdConsole ? "Stacja LCD" : "Konsola"}</span>
            </button>

            <button
              onClick={() => setIsQrModalOpen(true)}
              className="p-3 bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 rounded-2xl text-slate-100 hover:text-white transition-all active:scale-95 shadow-lg backdrop-blur-xl cursor-pointer flex items-center justify-center"
              title="Pokaż kod QR"
              id="btn-show-qr"
            >
              <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </button>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-3 bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 rounded-2xl text-slate-100 hover:text-white transition-all active:scale-95 disabled:opacity-50 shadow-lg backdrop-blur-xl cursor-pointer flex items-center justify-center group"
              title="Odśwież pogodę"
              id="btn-refresh"
            >
              <RotateCw className={`w-4 h-4 sm:w-5 sm:h-5 text-cyan-300 transition-transform duration-700 ${isRefreshing ? "animate-spin" : "group-active:rotate-180"}`} />
            </button>
          </div>
        </div>

        {/* Moje Miejsca (Saved Places) */}
        <SavedPlacesSection 
          currentCity={city}
          currentLat={userLat || 52.8441}
          currentLng={userLng || 19.1772}
          onSelectPlace={(lat, lng, name) => {
            if (onLocationSelected) {
              onLocationSelected(lat, lng, name, false, true);
            } else {
              onRefresh();
            }
          }}
        />

        {/* Ostrzeżenia Meteorologiczne Placeholder */}
        <WeatherWarningsPlaceholder />

        {/* ========================================================================= */}
        {/* 2. GŁÓWNA KARTA POGODY (Duży Glassmorphism: Miasto -> Temp -> Odczuwalna -> Ikona/Opis) */}
        {/* ========================================================================= */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-4xl mx-auto mb-6 p-6 sm:p-8 md:p-10 rounded-[36px] bg-gradient-to-b from-white/[0.10] to-white/[0.03] backdrop-blur-2xl border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.25)] relative overflow-hidden text-center"
          id="main-hero-weather-card"
        >
          {/* Subtle top light reflection line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          
          {/* Location Name (Clickable to refresh GPS) */}
          <div 
            onClick={handleAutoDetectLocation}
            className="inline-flex items-center justify-center space-x-2 mb-1.5 cursor-pointer group px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all shadow-inner"
            title="Kliknij, aby odświeżyć lokalizację"
          >
            <MapPin className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform drop-shadow" />
            <span className="text-sm sm:text-base font-bold text-slate-100 tracking-wide">
              {getCityLocationString(city)}
            </span>
          </div>

          {/* Location Source / Method Diagnostic Badge */}
          {geoDiagnostic && (
            <div className="flex items-center justify-center gap-2 mb-2.5">
              <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border flex items-center gap-1 backdrop-blur-md ${
                geoDiagnostic.method?.includes("cached") || geoDiagnostic.method?.includes("cache")
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : geoDiagnostic.method?.includes("gps") || geoDiagnostic.method?.includes("GPS")
                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                  : "bg-slate-800/60 text-slate-300 border-slate-700"
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {geoDiagnostic.method?.includes("cached") || geoDiagnostic.method?.includes("cache")
                  ? "Poprzednia lokalizacja (dane z pamięci)"
                  : geoDiagnostic.method?.includes("gps_high")
                  ? `GPS (${geoDiagnostic.accuracy ? `±${geoDiagnostic.accuracy}m` : "Satelita"})`
                  : geoDiagnostic.method?.includes("gps")
                  ? "Natywny GPS"
                  : geoDiagnostic.method || "Lokalizacja ręczna"}
              </span>
            </div>
          )}

          {/* Active IMGW Station badge or Temperature Source Diagnostic badge */}
          {activeStation ? (
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              {calibrationDetails.isDelayed ? (
                <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  {calibrationDetails.statusLabel}
                </span>
              ) : isUsingImgw ? (
                <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  Stacja IMGW: <strong className="text-white">{(activeStation as any).stationName || (activeStation as any).name || "Najbliższa stacja"}</strong>
                  {(activeStation as any).distanceKm !== undefined ? ` (${Math.round((activeStation as any).distanceKm)} km)` : ((activeStation as any).distance ? ` (${(activeStation as any).distance})` : '')}
                  {calibrationDetails.measurementHourStr ? ` • ${calibrationDetails.measurementHourStr}` : ''}
                  {calibrationDetails.expectedNextUpdateStr ? ` (kolejny ~${calibrationDetails.expectedNextUpdateStr})` : ''}
                  <span className="text-emerald-400 font-bold ml-1">• Rzeczywisty pomiar</span>
                </span>
              ) : (
                <span className="text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-3 py-0.5 rounded-full flex items-center gap-1.5 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Model Open-Meteo (Best Match)
                </span>
              )}
              {typeof rawCurrentTemp === 'number' && (
                <span className="text-[10px] text-slate-400 bg-black/30 border border-white/10 px-2.5 py-0.5 rounded-full backdrop-blur-md">
                  Model Open-Meteo: {rawCurrentTemp.toFixed(1).replace('.', ',')}°C
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center mb-3">
              <span className="text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-3 py-0.5 rounded-full flex items-center gap-1.5 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Model Open-Meteo (Best Match)
              </span>
            </div>
          )}

          {/* 3. BIG TEMPERATURE & HIERARCHY */}
          <div className="flex flex-col items-center justify-center my-3 sm:my-5">
            <div className="flex items-start justify-center">
              <span className="text-8xl sm:text-9xl md:text-[10.5rem] font-black tracking-tighter text-white leading-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)] select-none">
                {currentTemp !== null ? currentTemp.toFixed(1).replace('.', ',') : '—'}
              </span>
              <span className="text-5xl sm:text-6xl md:text-7xl font-extralight text-cyan-200/90 mt-2 ml-1 select-none">°</span>
            </div>

            {/* Temperatura odczuwalna tuż pod głównym wynikiem °C */}
            <div className="mt-2.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.08] border border-white/15 backdrop-blur-md shadow-lg">
              <Thermometer className="w-4 h-4 text-amber-300" />
              <span className="text-sm sm:text-base font-medium text-slate-200">
                Temperatura odczuwalna: <strong className="text-white font-black ml-1">{currentApparentTemp !== null && !isNaN(currentApparentTemp) ? `${currentApparentTemp.toFixed(1).replace('.', ',')}°C` : 'Brak danych'}</strong>
              </span>
            </div>

            {/* Wskaźnik porównawczy: O X°C cieplej/chłodniej niż wczoraj */}
            {tempDiffYesterday !== null && (
              <div className="mt-2 flex items-center justify-center">
                {tempDiffYesterday > 0.2 ? (
                  <span className="text-[11px] sm:text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    O <strong className="text-white font-bold">{tempDiffYesterday.toFixed(1).replace('.', ',')}°C</strong> cieplej niż wczoraj
                  </span>
                ) : tempDiffYesterday < -0.2 ? (
                  <span className="text-[11px] sm:text-xs font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                    <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />
                    O <strong className="text-white font-bold">{Math.abs(tempDiffYesterday).toFixed(1).replace('.', ',')}°C</strong> chłodniej niż wczoraj
                  </span>
                ) : (
                  <span className="text-[11px] sm:text-xs font-medium text-slate-300 bg-white/10 border border-white/15 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md">
                    Temperatura taka sama jak wczoraj o tej porze (±0,2°C)
                  </span>
                )}
              </div>
            )}

            {/* Podpis dynamicznej kalibracji danych (Bias Correction / IMGW) */}
            {calibrationDetails.isDelayed ? (
              <div className="mt-2 flex items-center justify-center">
                <span className="text-[11px] sm:text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  {calibrationDetails.statusLabel} • Aktywny profil na żywo z Open-Meteo
                </span>
              </div>
            ) : calibrationDetails.isCalibrated ? (
              <div className="mt-2 flex items-center justify-center">
                <span className="text-[11px] sm:text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {calibrationDetails.statusLabel}
                  {Math.abs(calibrationDetails.bias) > 0 ? ` (korekta ${calibrationDetails.bias > 0 ? '+' : ''}${calibrationDetails.bias.toFixed(1)}°C)` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-center">
                <span className="text-[11px] font-medium text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/20 px-3 py-0.5 rounded-full flex items-center gap-1.5 backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Model numeryczny Open-Meteo
                </span>
              </div>
            )}

            {/* Wiatr i porywy w głównej karcie */}
            <div className="mt-3 flex items-center justify-center">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-slate-200 backdrop-blur-md">
                <Wind className="w-3.5 h-3.5 text-teal-300" />
                <span>Wiatr: <strong className="text-white font-bold">{currentWindSpeed !== null ? `${currentWindSpeed} km/h` : '—'}</strong></span>
                <span className="text-teal-300 font-bold ml-0.5">
                  (porywy do <strong className="text-white">{currentWindGusts !== null ? `${currentWindGusts} km/h` : (currentWindSpeed !== null ? `${Math.round(currentWindSpeed * 1.3)} km/h` : '—')}</strong>)
                </span>
                <span className="text-slate-400 text-[11px] ml-0.5">• {windDirText}</span>
              </span>
            </div>
          </div>

          {/* Ikona + Opis pogody */}
          <div className="flex items-center justify-center gap-3.5 mt-5 pt-4 border-t border-white/12">
            <div className="p-2.5 rounded-2xl bg-white/[0.08] border border-white/15 shadow-lg backdrop-blur-md">
              <AiWeatherIcon 
                code={userWeatherOverrideCode ?? currentWeatherMeta.code}
                isDay={isDay}
                cloudCover={wyswietlaneZachmurzenie}
                precip={currentPrecipitation}
                className="w-11 h-11 sm:w-14 sm:h-14"
                size="md"
              />
            </div>
            <p className="text-lg sm:text-xl font-bold text-white capitalize tracking-tight text-left drop-shadow">
              {displayOpis}
            </p>
          </div>

          {/* Weryfikacja Satelitarna & Widok z Okna */}
          <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-300 font-medium bg-white/[0.04] px-3.5 py-1 rounded-full border border-white/8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="text-slate-400">Pomiar satelitarny:</span>
              <span className="text-amber-300 font-semibold">
                {currentShortwaveRadiation !== undefined && currentShortwaveRadiation > 40 
                  ? `Promieniowanie słoneczne ${Math.round(currentShortwaveRadiation)} W/m² (Słońce / Brak opadów)` 
                  : 'Satelita optyczno-radarowy aktywny'}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <span className="text-xs text-slate-400 font-medium mr-1">Widok za oknem:</span>
              <button
                onClick={() => {
                  const newCode = 0; // Słońce
                  setUserWeatherOverrideCode(newCode);
                  try { localStorage.setItem("aura_user_weather_override", String(newCode)); } catch(e){}
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  userWeatherOverrideCode === 0 
                    ? 'bg-amber-500/30 text-amber-200 border-amber-400/60 shadow-lg shadow-amber-500/25 scale-105' 
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                ☀️ Słońce
              </button>
              <button
                onClick={() => {
                  const newCode = 2; // Chmury
                  setUserWeatherOverrideCode(newCode);
                  try { localStorage.setItem("aura_user_weather_override", String(newCode)); } catch(e){}
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  userWeatherOverrideCode === 2 
                    ? 'bg-blue-500/30 text-blue-200 border-blue-400/60 shadow-lg shadow-blue-500/25 scale-105' 
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                ⛅ Chmury
              </button>
              <button
                onClick={() => {
                  const newCode = 61; // Deszcz
                  setUserWeatherOverrideCode(newCode);
                  try { localStorage.setItem("aura_user_weather_override", String(newCode)); } catch(e){}
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  userWeatherOverrideCode === 61 
                    ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400/60 shadow-lg shadow-cyan-500/25 scale-105' 
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                🌧️ Deszcz
              </button>
              {userWeatherOverrideCode !== null && (
                <button
                  onClick={() => {
                    setUserWeatherOverrideCode(null);
                    try { localStorage.removeItem("aura_user_weather_override"); } catch(e){}
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/5 border border-white/10 transition-all hover:bg-white/10"
                  title="Przywróć model stacyjny"
                >
                  ↺ Resetuj
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* ========================================================================= */}
        {/* NOWY MODUŁ: Życiowy Asystent Pogodowy (Smart Weather Assistant)           */}
        {/* ========================================================================= */}
        <div className="max-w-4xl mx-auto mb-6">
          <SmartWeatherAssistantCard 
            data={data}
            currentTemp={currentTemp}
            currentApparentTemp={currentApparentTemp}
            currentWindSpeed={currentWindSpeed}
            currentWindGusts={currentWindGusts}
            currentPrecipitation={currentPrecipitation}
            currentCloudCover={currentCloudCover}
            currentShortwaveRadiation={currentShortwaveRadiation}
            isDay={isDay}
          />
        </div>

        {/* ========================================================================= */}
        {/* 4. KAFELKI PARAMETRÓW (Wilgotność, Wiatr, Opady, Zachmurzenie, Ciśnienie, UV) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5 max-w-4xl mx-auto mb-6">
          {/* Wilgotność */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-cyan-400/30 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all"
          >
            <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-400/20 mb-2 shadow-inner">
              <Droplets className="w-5 h-5 text-cyan-400 drop-shadow" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {currentHumidity !== null ? `${currentHumidity}%` : '—'}
            </span>
            <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-1 drop-shadow-sm">
              Wilgotność
            </span>
          </motion.div>

          {/* Wiatr & Porywy */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="p-3.5 sm:p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-teal-400/30 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all justify-between"
          >
            <div className="flex flex-col items-center w-full">
              <div className="p-2.5 rounded-2xl bg-teal-500/15 border border-teal-400/20 mb-1.5 shadow-inner">
                <Wind className="w-5 h-5 text-teal-400 drop-shadow" />
              </div>
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {currentWindSpeed !== null ? `${currentWindSpeed} km/h` : '—'}
              </span>
              <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-0.5 drop-shadow-sm">
                Wiatr
              </span>
            </div>
            
            {/* Porywy wiatru w kafelku głównym */}
            <div className="mt-2 w-full pt-2 border-t border-white/10 flex flex-col items-center">
              <div className="px-2 py-0.5 rounded-lg bg-teal-500/20 border border-teal-500/30 text-[10px] text-teal-200 font-bold w-full truncate">
                Porywy: <strong className="text-white font-bold">{currentWindGusts !== null ? `${currentWindGusts} km/h` : (currentWindSpeed !== null ? `${Math.round(currentWindSpeed * 1.3)} km/h` : '—')}</strong>
              </div>
              <span className="text-[10px] text-slate-300 font-medium mt-1">
                {windDirText} • {currentWindDirection}°
              </span>
            </div>
          </motion.div>

          {/* Opady */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-blue-400/30 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all"
          >
            <div className="p-2.5 rounded-2xl bg-blue-500/15 border border-blue-400/20 mb-2 shadow-inner">
              <CloudRain className="w-5 h-5 text-blue-400 drop-shadow" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {currentPrecipitation !== null ? `${currentPrecipitation} mm` : '0 mm'}
            </span>
            <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-1 drop-shadow-sm">
              Opady
            </span>
          </motion.div>

          {/* Zachmurzenie (Optyczne OptiCloud & Modelowe) */}
          <motion.div 
            whileHover={{ y: -3 }}
            onClick={() => setIsCloudModalOpen(true)}
            className="p-3.5 sm:p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-indigo-400/40 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all justify-between cursor-pointer group"
            title={`Zachmurzenie optyczne (OptiCloud): ${opticalCloudCover}% (${opticalCloudLabel})\nPokrycie modelowe: ${currentCloudCover}%\nWarstwy:\nNiskie: ${lowCloud}%\nŚrednie: ${midCloud}%\nWysokie: ${highCloud}%\n\nOptiCloud – autorski wskaźnik Aury uwzględniający wpływ poszczególnych warstw chmur na odbiór zachmurzenia przez obserwatora.\n\nKliknij, aby otworzyć szczegóły warstw.`}
          >
            <div className="flex flex-col items-center w-full">
              <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-400/20 mb-1.5 shadow-inner group-hover:scale-105 transition-transform">
                <Cloud className="w-5 h-5 text-indigo-400 drop-shadow" />
              </div>
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {opticalCloudCover !== null ? `${opticalCloudCover}%` : '—'}
              </span>
              <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-0.5 drop-shadow-sm">
                Zachmurzenie
              </span>
              <span className="text-[9.5px] text-indigo-300 font-semibold">
                optyczne (OptiCloud)
              </span>
            </div>

            {/* Wskaźnik Optyczny & Model */}
            <div className="mt-2 w-full pt-2 border-t border-white/10 flex flex-col items-center">
              <div className="px-2 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-[10px] text-indigo-200 font-bold w-full truncate flex items-center justify-center gap-1">
                <span className="text-white font-bold truncate">{opticalCloudLabel}</span>
              </div>
              <span className="text-[9px] text-slate-300 font-medium truncate w-full mt-1">
                Model: <strong className="text-slate-200">{currentCloudCover}%</strong> (szczegóły ↗)
              </span>
            </div>
          </motion.div>

          {/* Ciśnienie */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-emerald-400/30 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all"
          >
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/20 mb-2 shadow-inner">
              <Gauge className="w-5 h-5 text-emerald-400 drop-shadow" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {currentPressure !== null ? `${currentPressure} hPa` : '—'}
            </span>
            <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-1 drop-shadow-sm">
              Ciśnienie
            </span>
          </motion.div>

          {/* UV */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="p-4 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-amber-400/30 rounded-3xl flex flex-col items-center text-center shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all"
          >
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/20 mb-2 shadow-inner">
              <Sun className="w-5 h-5 text-amber-400 drop-shadow" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {uvVal !== null && !isNaN(uvVal) ? formatUvDisplay(uvVal) : '—'}
            </span>
            <span className="text-[11px] text-white/90 font-bold uppercase tracking-wider mt-1 drop-shadow-sm">
              Indeks UV
            </span>
            <span className="text-[10px] text-amber-300 font-semibold mt-0.5 tracking-tight">
              {uvVal !== null && !isNaN(uvVal) ? getUvIndexDescription(uvVal) : '—'}
            </span>
          </motion.div>
        </div>

        {/* DZISIAJ Section (Min/Max, Prawd. Opadów, UV, Wschód, Zachód, Porywy wiatru) */}
        <div className="max-w-4xl mx-auto bg-gradient-to-b from-white/[0.08] to-white/[0.03] border border-white/15 rounded-[32px] p-5 sm:p-6 mb-6 text-left shadow-xl backdrop-blur-2xl">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse" />
            Dzisiaj w pigułce
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 shrink-0">
                <Thermometer className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Min / Max</span>
                <strong className="text-white text-sm font-bold">
                  {todayMinTemp !== null ? Math.round(todayMinTemp) : '—'}° / {todayMaxTemp !== null ? Math.round(todayMaxTemp) : '—'}°
                </strong>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 shrink-0">
                <CloudRain className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Prawd. opadów</span>
                <strong className="text-white text-sm font-bold">
                  {resolvedTodayPopMax !== null ? `${resolvedTodayPopMax}%` : '—'}
                </strong>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 shrink-0">
                <Wind className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Porywy wiatru</span>
                <strong className="text-white text-sm font-bold">
                  {todayMaxGusts !== null ? `${todayMaxGusts} km/h` : (currentWindGusts !== null ? `${currentWindGusts} km/h` : '—')}
                </strong>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Indeks UV</span>
                <strong className="text-white text-sm font-bold">
                  {todayMaxUv !== null && !isNaN(todayMaxUv) 
                    ? `${Math.round(todayMaxUv)} (${getUvIndexDescription(todayMaxUv)})` 
                    : (uvVal !== null && !isNaN(uvVal) ? `${formatUvDisplay(uvVal)} (${getUvIndexDescription(uvVal)})` : '—')}
                </strong>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-300 shrink-0">
                <Sunrise className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Wschód słońca</span>
                <strong className="text-white text-sm font-bold">
                  {daily?.sunrise?.[todayDailyIndex] && !isNaN(new Date(daily.sunrise[todayDailyIndex]).getTime()) ? new Date(daily.sunrise[todayDailyIndex]).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </strong>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-2xl border border-white/8 hover:border-white/15 transition-all">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-300 shrink-0">
                <Sunset className="w-4 h-4" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-semibold uppercase">Zachód słońca</span>
                <strong className="text-white text-sm font-bold">
                  {daily?.sunset?.[todayDailyIndex] && !isNaN(new Date(daily.sunset[todayDailyIndex]).getTime()) ? new Date(daily.sunset[todayDailyIndex]).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Szczegóły pogody (Collapsible) */}
        <div className="max-w-4xl mx-auto mb-6">
          <button
            onClick={() => setShowAllDetails(!showAllDetails)}
            className="w-full py-3 px-4 bg-white/[0.06] hover:bg-white/[0.10] border border-white/12 rounded-2xl text-xs font-bold text-slate-200 hover:text-white flex items-center justify-between transition-all cursor-pointer shadow-md backdrop-blur-xl"
          >
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              Rozszerzone parametry (porywy wiatru, kierunek, widzialność, źródła)
            </span>
            {showAllDetails ? <ChevronUp className="w-4 h-4 text-cyan-300" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showAllDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-white/[0.06] border border-white/12 rounded-2xl p-4 text-left text-xs backdrop-blur-2xl"
            >
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Porywy wiatru</span>
                <strong className="text-white text-sm">{currentWindGusts !== null ? `${currentWindGusts} km/h` : 'Brak danych'}</strong>
              </div>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Kierunek wiatru</span>
                <strong className="text-white text-sm">{currentWindDirection !== null ? `${currentWindDirection}° (${windDirText})` : 'Brak danych'}</strong>
              </div>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Widoczność</span>
                <strong className="text-white text-sm">{visibilityKm} km</strong>
              </div>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Promieniowanie</span>
                <strong className="text-white text-sm">
                  {typeof current?.shortwave_radiation === 'number'
                    ? `${Math.round(current.shortwave_radiation)} W/m²`
                    : (current?.is_day === 0 ? '0 W/m²' : 'Brak danych')}
                </strong>
              </div>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Zaktualizowano</span>
                <strong className="text-white text-xs">
                  {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : 'Brak danych'}
                </strong>
              </div>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                <span className="text-slate-400 block text-[10px]">Źródło danych</span>
                <strong className="text-white text-xs truncate block">
                  {(data.activeServers || data.weather?.activeServers || ['Open-Meteo'])[0]}
                </strong>
              </div>
            </motion.div>
          )}
        </div>

        {/* Main View Mode Selector Tabs */}
        <div className="max-w-4xl mx-auto mb-6 px-1 flex items-center justify-center gap-2 p-1.5 bg-white/[0.05] border border-white/12 rounded-2xl shadow-xl backdrop-blur-2xl">
          <button
            onClick={() => setShowLcdConsole(false)}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !showLcdConsole
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg border border-cyan-400/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Gauge className="w-4 h-4 text-cyan-300" />
            <span>Widok Nowoczesny</span>
          </button>

          <button
            onClick={() => setShowLcdConsole(true)}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              showLcdConsole
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg border border-amber-400/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Tv className="w-4 h-4 text-amber-400" />
            <span>Stacja LCD (METEO SP601)</span>
          </button>
        </div>

        {showLcdConsole ? (
          <div className="max-w-4xl mx-auto mb-8">
            <MeteoLcdConsole 
              data={data} 
              fusedWindSpeed={currentWindSpeed}
              fusedTemp={currentTemp}
              fusedApparentTemp={currentApparentTemp}
              fusedHumidity={currentHumidity}
              fusedPressure={currentPressure}
              fusedWindGusts={currentWindGusts}
              fusedWindDirection={currentWindDirection}
              fusedUvIndex={currentUvIndex}
              fusedPrecipitation={currentPrecipitation}
            />
          </div>
        ) : (
          <>
            {/* Sekcja Opadów & Ryzyko Deszczu (Radar Opadowy Nowcast) */}
            <div className="max-w-4xl mx-auto mb-8">
              <RainAlertNowcastCard data={data} />
            </div>
          </>
        )}

        {activeRecs.length > 0 && (
          <div className="w-full max-w-4xl mx-auto mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Rekomendacje Dnia</span>
              <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">{activeRecs.length} PORADY</span>
            </div>
            <div className="flex overflow-x-auto pb-2 gap-4 snap-x no-scrollbar">
              {activeRecs.map(rec => (
                <motion.div 
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`min-w-[280px] flex-1 ${rec.color} border rounded-3xl p-5 text-left relative snap-center shadow-lg backdrop-blur-xl`}
                >
                  <div className="bg-white/10 text-[9px] font-black tracking-widest px-2.5 py-0.5 rounded-full inline-block mb-3 border border-white/10">
                    {rec.type}
                  </div>
                  <p className="text-sm font-bold text-slate-100 leading-relaxed pr-6">
                    {rec.text}
                  </p>
                  <button 
                    onClick={() => setDismissedRecs(prev => [...prev, rec.id])}
                    className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-[11px] font-bold text-slate-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Zrozumiano ✓
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. GODZINY (Nowoczesny poziomy timeline: godzina → ikona → temp → odczuwalna → opady → wiatr) */}
        {/* ========================================================================= */}
        <section className="space-y-4 max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs uppercase tracking-widest text-slate-200 font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Prognoza Godzinowa (24h)
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold">Przewiń w prawo →</span>
          </div>
          <div className="flex overflow-x-auto pb-3 pt-1 gap-3 snap-x no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0 touch-pan-x" style={{ willChange: 'scroll-position' }}>
            {calibratedNext24Hours.map((hour, idx) => {
              if (!hour) return null;
              const isNow = idx === 0;
              return (
                <div 
                  key={idx}
                  className={`min-w-[110px] flex flex-col items-center py-4 px-3 rounded-2xl snap-start transition-all border shadow-lg backdrop-blur-2xl ${
                    isNow 
                      ? 'bg-gradient-to-b from-blue-600/35 to-blue-900/30 border-blue-400/60 shadow-blue-500/20 ring-1 ring-blue-400/50 scale-[1.02]' 
                      : 'bg-gradient-to-b from-white/[0.08] to-white/[0.02] border-white/12 hover:bg-white/[0.12] hover:border-white/25'
                  }`}
                >
                  <span className={`text-[11px] font-bold mb-1.5 ${isNow ? 'text-cyan-300 font-black' : 'text-slate-300'}`}>
                    {isNow ? 'Teraz' : hour.hourLabel}
                  </span>
                  
                  <div className="p-1 rounded-xl bg-white/[0.04] my-1">
                    <AiWeatherIcon 
                      code={hour.code}
                      isDay={new Date(hour.timeStr).getHours() >= 6 && new Date(hour.timeStr).getHours() < 20}
                      cloudCover={hour.cloudCover}
                      precip={hour.precip}
                      className="w-8 h-8"
                    />
                  </div>

                  {/* Temperatura rzeczywista */}
                  <span className="text-lg font-black text-white tracking-tight mt-1">
                    {Math.round(hour.temp)}°
                  </span>

                  {/* Odczuwalna */}
                  {hour.apparentTemp !== undefined && hour.apparentTemp !== null && (
                    <span className="text-[10px] font-medium text-slate-300 mt-0.5">
                      odcz. {Math.round(hour.apparentTemp)}°
                    </span>
                  )}

                  {/* Opady */}
                  <div className="flex items-center mt-2 text-[10px] text-cyan-300 font-bold bg-cyan-500/15 border border-cyan-500/25 px-2 py-0.5 rounded-full">
                    <Droplets className="w-2.5 h-2.5 mr-1" />
                    {hour.pop}%
                  </div>

                  {/* Wiatr & Porywy */}
                  {hour.windSpeed !== undefined && hour.windSpeed !== null && (
                    <div className="flex flex-col items-center mt-1.5 text-[9px] text-teal-300 font-semibold leading-tight">
                      <div className="flex items-center">
                        <Wind className="w-2.5 h-2.5 mr-0.5" />
                        {Math.round(hour.windSpeed)} km/h
                      </div>
                      {hour.windGusts !== undefined && hour.windGusts !== null && (
                        <span className="text-[8px] text-teal-200 font-medium mt-0.5">
                          por. {Math.round(hour.windGusts)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Hourly Temperature / Precip / Wind Chart */}
        <HourlyWeatherChart hourly={hourly} />

        {/* AI Assistant - Floating fixed component (one instance at bottom) */}

          {/* Daily 3-Day Forecast */}
          <section className="space-y-4 max-w-4xl mx-auto mb-10">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs uppercase tracking-widest text-slate-200 font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                Prognoza 3-dniowa
              </h3>
              <button 
                onClick={() => setExpandedDayIndex(expandedDayIndex === 'all' ? null : 'all')}
                className="flex items-center space-x-2 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 rounded-xl border border-white/12 transition-all active:scale-95 cursor-pointer backdrop-blur-md"
                title="Rozwiń lub zwiń wszystkie dni"
              >
                <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider">
                  {expandedDayIndex === 'all' ? 'Zwiń szczegóły' : 'Pokaż szczegóły'}
                </span>
                <Calendar className="w-3.5 h-3.5 text-cyan-300" />
              </button>
            </div>
            <div className="space-y-3">
              {daily.time.slice(todayDailyIndex, todayDailyIndex + 3).map((day, offsetIdx) => {
                const actualDailyIdx = todayDailyIndex + offsetIdx;
                const dayName = offsetIdx === 0 ? "Dziś" : offsetIdx === 1 ? "Jutro" : new Date(day).toLocaleDateString("pl-PL", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
                const dayWCode = daily.weather_code?.[actualDailyIdx] ?? 0;
                const dMeta = getWeatherMeta(dayWCode, true);
                const isExpanded = expandedDayIndex === 'all' || expandedDayIndex === offsetIdx;
                const dayPop = typeof daily.precipitation_probability_max?.[actualDailyIdx] === 'number' ? daily.precipitation_probability_max[actualDailyIdx] : 0;
                const dayMaxT = typeof daily.temperature_2m_max?.[actualDailyIdx] === 'number' ? Math.round(daily.temperature_2m_max[actualDailyIdx]) : (currentTemp !== null ? Math.round(currentTemp) : '—');
                const dayMinT = typeof daily.temperature_2m_min?.[actualDailyIdx] === 'number' ? Math.round(daily.temperature_2m_min[actualDailyIdx]) : (currentTemp !== null ? Math.round(currentTemp) : '—');
                
                return (
                  <div key={day} className="flex flex-col">
                    <div 
                      onClick={() => setExpandedDayIndex(expandedDayIndex === offsetIdx ? null : offsetIdx)}
                      className={`flex items-center justify-between p-4 sm:p-5 border rounded-3xl transition-all cursor-pointer group active:scale-[0.99] backdrop-blur-2xl shadow-lg ${
                        isExpanded 
                          ? 'bg-gradient-to-r from-blue-600/30 via-cyan-600/20 to-blue-900/30 border-blue-400/50 shadow-blue-500/20 ring-1 ring-blue-400/40' 
                          : 'bg-gradient-to-b from-white/[0.08] to-white/[0.02] border-white/12 hover:bg-white/[0.12] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center space-x-3 w-36">
                        <div className="flex flex-col">
                          <span className={`text-sm sm:text-base font-bold transition-colors ${isExpanded ? 'text-cyan-300' : 'text-slate-100'}`}>{dayName}</span>
                          <span className="text-[11px] text-slate-300 font-medium truncate max-w-[120px]">{dMeta.text}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="p-1 rounded-xl bg-white/[0.04]">
                          <AiWeatherIcon 
                            code={dayWCode}
                            isDay={true}
                            cloudCover={50}
                            className="w-8 h-8"
                          />
                        </div>
                        <div className="flex items-center text-xs text-cyan-300 font-bold bg-cyan-500/15 border border-cyan-500/20 px-2 py-0.5 rounded-full min-w-[40px]">
                          <Droplet className="w-3 h-3 mr-1" />
                          {dayPop}%
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 min-w-[85px] justify-end">
                        <div className="flex flex-col items-end">
                          <span className="text-base sm:text-lg font-black text-white">{dayMaxT}°</span>
                          <span className="text-xs text-slate-400 font-semibold">{dayMinT}°</span>
                        </div>
                        <span className={`text-xs transition-transform duration-300 ${isExpanded ? 'text-cyan-300 rotate-180' : 'text-slate-500'}`}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 overflow-x-auto no-scrollbar pb-2 touch-pan-x" style={{ willChange: 'scroll-position' }}>
                        <div className="flex space-x-2.5 p-1">
                          {getHourlyForDay(day).map((h, hIdx) => (
                            <div key={hIdx} className="min-w-[80px] flex flex-col items-center p-3 bg-white/[0.05] border border-white/10 rounded-2xl text-center backdrop-blur-xl shadow-md">
                              <span className="text-[10px] text-slate-300 font-bold mb-1">{h.hourLabel}</span>
                              <AiWeatherIcon 
                                code={h.code}
                                isDay={new Date(h.timeStr).getHours() >= 6 && new Date(h.timeStr).getHours() < 20}
                                cloudCover={h.cloudCover}
                                precip={h.precip}
                                className="w-7 h-7 my-1"
                              />
                              <span className="text-sm font-black text-white">{Math.round(h.temp)}°</span>
                              <div className="text-[9px] text-cyan-300 font-bold mt-0.5 bg-cyan-500/15 px-1.5 py-0.5 rounded-full">{h.pop}%</div>
                              {h.precip > 0 && (
                                <div className="text-[8px] text-cyan-200 font-medium mt-0.5">
                                  {h.precip < 0.1 ? `${h.precip.toFixed(2)}mm` : `${h.precip.toFixed(1)}mm`}
                                </div>
                              )}
                              <div className="text-[8px] text-slate-400 font-medium mt-0.5">{h.cloudCover}% chm.</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* MODULARNY DÓŁ (PODZIAŁ NA ZAKŁADKI / PANELE) */}
          <div className="max-w-4xl mx-auto pt-6 border-t border-white/12">
            {/* High-Tech Tab Switcher Navigation Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-3 bg-white/[0.05] p-2 border border-white/12 rounded-[28px] backdrop-blur-2xl shadow-xl">
              <div className="flex items-center space-x-1.5 w-full md:w-auto">
                <button
                  onClick={() => setActiveTab('satellites')}
                  className={`flex-1 md:flex-none py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-center space-x-2 transition-all duration-300 cursor-pointer ${
                    activeTab === 'satellites'
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 border border-blue-400/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-satellites"
                >
                  <Waves className="w-4 h-4 text-cyan-300" />
                  <span>Radar i Satelity</span>
                </button>

                <button
                  onClick={() => setActiveTab('agro')}
                  className={`flex-1 md:flex-none py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-center space-x-2 transition-all duration-300 cursor-pointer ${
                    activeTab === 'agro'
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30 border border-emerald-400/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-agro"
                >
                  <Sprout className="w-4 h-4 text-emerald-300" />
                  <span>Agro i Środowisko</span>
                </button>

                <button
                  onClick={() => setActiveTab('diagnostics')}
                  className={`flex-1 md:flex-none py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-center space-x-2 transition-all duration-300 cursor-pointer ${
                    activeTab === 'diagnostics'
                      ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 border border-purple-400/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-diagnostics"
                >
                  <Settings className="w-4 h-4 text-purple-300" />
                  <span>Diagnostyka</span>
                </button>
              </div>

              <div className="hidden md:flex items-center space-x-3 px-4 py-2 bg-white/[0.03] rounded-full border border-white/5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Live Data Fusion</span>
              </div>
            </div>

            {/* Modular Tab Content Container */}
            <AnimatePresence mode="wait">
              {activeTab === 'satellites' && (
                <motion.div
                  key="satellites-panel"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {current ? (
                    <>
                      <StormRadar 
                        current={{ ...current, weather_code: wCode, precipitation: currentPrecipitation }} 
                        hourly={hourly}
                        daily={daily} 
                        lat={userLat || 52.8441} 
                        lng={userLng || 19.1772} 
                        city={city || "Lokalizacja GPS"} 
                      />
                      <SatelliteStatusCard 
                        locationName={city}
                        soilMoistureSat={current?.soil_moisture_satellite ?? 25}
                        cloudCoverSat={wyswietlaneZachmurzenie}
                      />
                      <WeatherSourceComparison 
                        sourcesData={data.sourcesData}
                        currentTemp={currentTemp}
                        currentCloud={wyswietlaneZachmurzenie}
                        currentWind={current?.wind_speed_10m ?? 0}
                        lat={userLat}
                        lng={userLng}
                        data={data}
                        imgwStation={data.imgwStation || selectedStationOverride}
                        initialMode="fusion"
                        onStationChange={(st) => {
                          setSelectedStationOverride(st);
                          setIsManualStationSelected(true);
                        }}
                      />
                    </>
                  ) : (
                    <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-3xl p-5 text-center text-slate-500">
                      Brak danych radarowych i satelitarnych
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'agro' && (
                <motion.div
                  key="agro-panel"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <AgroFieldConditionsCard current={current} data={data} selectedStation={selectedStationOverride} />
                  <WeatherSourceComparison 
                    sourcesData={data.sourcesData}
                    currentTemp={currentTemp}
                    currentCloud={wyswietlaneZachmurzenie}
                    currentWind={current?.wind_speed_10m ?? 0}
                    lat={userLat}
                    lng={userLng}
                    data={data}
                    imgwStation={data.imgwStation || selectedStationOverride}
                    initialMode="stations"
                    onStationChange={(st) => {
                      setSelectedStationOverride(st);
                      setIsManualStationSelected(true);
                    }}
                  />
                  <HeatStressTomorrowCard hourly={hourly} daily={daily} />
                  <NowcastPrecipitationAlert hourly={hourly} startIndex={currentIdx} />
                </motion.div>
              )}

              {activeTab === 'diagnostics' && (
                <motion.div
                  key="diagnostics-panel"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <AuraDiagnosticCenter 
                    data={data}
                    userLat={userLat}
                    userLng={userLng}
                    geoDiagnostic={geoDiagnostic}
                    onRefresh={onRefresh}
                  />

                  {data.airQuality && (
                    <AirQualityCard data={data.airQuality} />
                  )}

                  {data.hydrology && data.hydrology.stations && data.hydrology.stations.length > 0 && (
                    <HydrologyCard data={data.hydrology} />
                  )}

                  {/* Google Cloud & Scheduled Weather Server Sync Card */}
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-md relative overflow-hidden shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2.5 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                          <Cloud className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-100">Chmura Google & Serwer</h3>
                          <p className="text-[11px] text-slate-300 font-medium">{cloudSyncStatus}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">Aktywna</span>
                      </div>
                    </div>

                    <div className="bg-white/[0.04] p-3 rounded-2xl border border-white/10 mb-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Harmonogram resetu:</span>
                        <span className="text-slate-200 font-bold">06:00, 12:00, 18:00 (3x dziennie)</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Status serwera:</span>
                        <span className="text-cyan-400 font-bold truncate max-w-[180px]" title={syncSchedule?.status || "Synchronizowany"}>
                          {syncSchedule?.status || "Połączony z Open-Meteo"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleForceServerSync}
                      disabled={isForceSyncing}
                      className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                      id="btn-force-server-sync"
                    >
                      <RotateCw className={`w-4 h-4 ${isForceSyncing ? "animate-spin" : ""}`} />
                      <span>{isForceSyncing ? "Resetowanie..." : "Wymuś Reset z Serwera Pogodowego"}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error Message if needed */}
          <div id="error" style={{ display: 'none' }} className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-xs font-bold text-center"></div>

      {/* QR Code Sharing Modal */}
      <QrCodeModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />

      {/* PWA Diagnostic & Location Calibration Modal */}
      <PwaDiagnosticModal 
        isOpen={isPwaModalOpen} 
        onClose={() => setIsPwaModalOpen(false)} 
        measurementLocation={measurementLocation}
        onToggleLocation={(loc) => handleToggleLocation(loc)}
        onTriggerCameraLux={handleQuickCameraLuxMeasurement}
        cameraFacingMode={cameraFacingMode}
        onToggleCameraFacing={() => setCameraFacingMode(prev => prev === "environment" ? "user" : "environment")}
        geoDiagnostic={geoDiagnostic}
      />

      {/* Data Fusion Engine Modal */}
      <DataFusionEngineModal 
        isOpen={isFusionModalOpen}
        onClose={() => setIsFusionModalOpen(false)}
        fusionData={{
          stationName: selectedStationOverride?.name || "Brak aktywnej stacji",
          stationDistance: selectedStationOverride?.distance || "N/A",
          rawModelTemp: rawCurrentTemp,
          stationTemp: stTemp,
          fusedTemp: currentTemp,
          rawModelHumidity: rawCurrentHumidity,
          stationHumidity: stHumidity,
          fusedHumidity: currentHumidity,
          rawModelWind: rawCurrentWindSpeed,
          stationWind: stWind,
          fusedWind: currentWindSpeed,
          stationPressure: stPressure,
          phonePressure: phoneBarometer,
          fusedPressure: currentPressure,
          satelliteCloudCover: currentCloudCover,
          sensorLux,
          fusedCloudCover: wyswietlaneZachmurzenie,
          isLuxClamped,
          fusionMetadata: current?.fusion_metadata
        }}
      />

      <CloudLayersModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        modelCloudCover={currentCloudCover}
        opticalCloudCover={opticalCloudCover}
        opticalDescription={opticalCloudLabel}
        lowCloud={lowCloud}
        midCloud={midCloud}
        highCloud={highCloud}
      />

      <AuraDiagnosticCenter 
        data={data}
        userLat={userLat}
        userLng={userLng}
        geoDiagnostic={geoDiagnostic}
        onRefresh={onRefresh}
        isOpenAsModal={isDiagnosticCenterModalOpen}
        onCloseModal={() => setIsDiagnosticCenterModalOpen(false)}
      />

      <WeatherAlertsToast data={data} />
      </div>
    </div>
  );
}
