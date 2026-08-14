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
  sanitizeHourCode,
  getCloudCoverLabel,
  getCityLocationString,
  getWeatherDescription
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
import PwaDiagnosticModal, { GeoDiagnosticInfo } from "./PwaDiagnosticModal";
import AdditionalWeatherParameters from "./AdditionalWeatherParameters";
import NowcastPrecipitationAlert from "./NowcastPrecipitationAlert";
import AgroFieldConditionsCard from "./AgroFieldConditionsCard";
import HeatStressTomorrowCard from "./HeatStressTomorrowCard";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, LabelList, Tooltip, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import WeatherAlertsToast from "./WeatherAlertsToast";
import AirQualityCard from "./AirQualityCard";
import HydrologyCard from "./HydrologyCard";
import { detectUserLocation } from "../utils/geolocation";

interface MainWeatherProps {
  data: WeatherResponse;
  userLat: number;
  userLng: number;
  onRefresh: () => void;
  onBackToSearch: () => void;
  isRefreshing: boolean;
  onLocationSelected?: (lat: number, lng: number, displayName?: string) => void;
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
  const [isMeasuringCameraLux, setIsMeasuringCameraLux] = useState(false);
  const [cameraLuxError, setCameraLuxError] = useState<string | null>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [locationToast, setLocationToast] = useState<string | null>(null);

  const handleAutoDetectLocation = async () => {
    setIsLocating(true);
    setLocationToast("Wykrywanie lokalizacji GPS / IP...");
    try {
      const loc = await detectUserLocation({ timeoutMs: 8000 });
      setIsLocating(false);
      if (onLocationSelected) {
        onLocationSelected(loc.lat, loc.lng, loc.cityName);
      } else {
        onRefresh();
      }
      const methodLabel = loc.method === "gps_high" || loc.method === "gps_low" ? "GPS" : "IP";
      setLocationToast(`Pobrano lokalizację (${methodLabel}): ${loc.cityName || "Lokalizacja GPS"}`);
      setTimeout(() => setLocationToast(null), 4500);
    } catch (err) {
      console.warn("Auto detect location failed:", err);
      setIsLocating(false);
      setLocationToast("Nie udało się wykryć pozycji. Wybierz miasto z wyszukiwarki.");
      setTimeout(() => setLocationToast(null), 3500);
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

  useEffect(() => {
    // Detect web barometer / pressure observer
    if (typeof window !== "undefined" && "PressureObserver" in window) {
      try {
        if ((document as any).featurePolicy && !(document as any).featurePolicy.allowsFeature('compute-pressure')) {
          return;
        }
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
      } catch (e) {
        // Barometer fallback
      }
    }
  }, []);

  useEffect(() => {
    fetch('/api/weather/sync-schedule')
      .then(res => res.json())
      .then(d => { if (d.success) setSyncSchedule(d); })
      .catch(() => {});

    fetch('/api/cloud-storage')
      .then(res => res.json())
      .then(d => { if (d.success) setCloudSyncStatus("Zsynchronizowano (Google Cloud Firestore)"); })
      .catch(() => {});
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

  // Robust hourly fallback
  const hourly = weatherObj?.hourly && Array.isArray(weatherObj.hourly.time) && weatherObj.hourly.time.length > 0
    ? weatherObj.hourly
    : {
        time: Array.from({ length: 24 }, (_, i) => new Date(Date.now() + i * 3600000).toISOString()),
        temperature_2m: Array(24).fill(current?.temperature_2m ?? 20),
        weather_code: Array(24).fill(current?.weather_code ?? 0),
        precipitation: Array(24).fill(current?.precipitation ?? 0),
        precipitation_probability: Array(24).fill(0),
        wind_speed_10m: Array(24).fill(current?.wind_speed_10m ?? 10),
        uv_index: Array(24).fill(current?.uv_index ?? 3),
        cloud_cover: Array(24).fill(current?.cloud_cover ?? 20),
        relative_humidity_2m: Array(24).fill(current?.relative_humidity_2m ?? 50)
      };

  // Robust daily fallback
  const todayDateStr = new Date().toISOString().split('T')[0];
  const defaultSunrise = [`${todayDateStr}T05:30:00Z`];
  const defaultSunset = [`${todayDateStr}T20:30:00Z`];

  const daily = weatherObj?.daily && Array.isArray(weatherObj.daily.time) && weatherObj.daily.time.length > 0
    ? {
        sunrise: weatherObj.daily.sunrise || defaultSunrise,
        sunset: weatherObj.daily.sunset || defaultSunset,
        ...weatherObj.daily
      }
    : {
        time: [todayDateStr],
        weather_code: [current?.weather_code ?? 0],
        temperature_2m_max: [current?.temperature_2m ?? 20],
        temperature_2m_min: [current?.temperature_2m ?? 15],
        uv_index_max: [current?.uv_index ?? 3],
        precipitation_sum: [current?.precipitation ?? 0],
        precipitation_probability_max: [0],
        wind_speed_10m_max: [current?.wind_speed_10m ?? 10],
        sunrise: defaultSunrise,
        sunset: defaultSunset
      };
  const isDay = current?.is_day === 1;
  const weatherMeta = getWeatherMeta(current?.weather_code ?? 0, isDay, current?.cloud_cover ?? 0);
  const CurrentIcon = weatherMeta.icon;

  const getNext24HoursFromIndex = (startIndex: number) => {
    return Array.from({ length: 24 }).map((_, i) => {
      const idx = startIndex + i;
      if (idx >= hourly.time.length) return null;
      
      const timeStr = hourly.time[idx];
      const temp = hourly.temperature_2m[idx];
      let rawCode = hourly.weather_code[idx];
      const hourLabel = new Date(timeStr).toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit"
      });

      const pop = (hourly.precipitation_probability && typeof hourly.precipitation_probability[idx] === 'number') 
        ? hourly.precipitation_probability[idx] 
        : 0;
      let cloudCover = (hourly.cloud_cover && typeof hourly.cloud_cover[idx] === 'number')
        ? hourly.cloud_cover[idx]
        : 0;

      const precip = (hourly.precipitation && typeof hourly.precipitation[idx] === 'number')
        ? hourly.precipitation[idx]
        : 0;

      cloudCover = Math.min(100, Math.max(0, Math.round(cloudCover)));

      const sanitizedCode = sanitizeHourCode(rawCode, pop, precip, cloudCover);
      const hourMeta = getWeatherMeta(sanitizedCode, isDay, cloudCover);
      const HourIcon = hourMeta.icon;

      return {
        timeStr,
        hourLabel,
        temp,
        code: sanitizedCode,
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

  const rawCurrentTemp = Math.round(current?.temperature_2m ?? hourly.temperature_2m?.[currentIdx] ?? 0);
  const rawCurrentApparentTemp = Math.round(current?.apparent_temperature ?? hourly.apparent_temperature?.[currentIdx] ?? rawCurrentTemp);
  const cLow = hourly.cloud_cover_low?.[currentIdx] ?? current?.cloud_cover_low ?? 0;
  const cMid = hourly.cloud_cover_mid?.[currentIdx] ?? current?.cloud_cover_mid ?? 0;
  const cHigh = hourly.cloud_cover_high?.[currentIdx] ?? current?.cloud_cover_high ?? 0;
  const currentPrecipitation = current?.precipitation ?? hourly.precipitation?.[currentIdx] ?? 0;

  const wCode = current?.weather_code ?? hourly.weather_code?.[currentIdx] ?? 0;

  const rawCloud = current?.cloud_cover;
  let currentCloudCover = typeof rawCloud === 'number'
    ? Math.min(100, Math.max(0, Math.round(rawCloud)))
    : (typeof hourly.cloud_cover?.[currentIdx] === 'number'
      ? Math.min(100, Math.max(0, Math.round(hourly.cloud_cover[currentIdx])))
      : 0);

  // Optical cloud cover calculation: Low clouds = 1.0, Mid = 0.5, High cirrus = 0.2
  let calculatedOptical = Math.round(cLow * 1.0 + cMid * 0.5 + cHigh * 0.2);
  if (cLow === 0 && cMid === 0 && cHigh === 0) {
    calculatedOptical = currentCloudCover;
  }
  currentCloudCover = Math.min(currentCloudCover, calculatedOptical);

  if (wCode === 0) currentCloudCover = Math.min(currentCloudCover, 5);
  else if (wCode === 1) currentCloudCover = Math.min(currentCloudCover, 20);
  else if (wCode === 2) currentCloudCover = Math.min(currentCloudCover, 45);

  const currentPop = typeof hourly.precipitation_probability?.[currentIdx] === 'number' ? hourly.precipitation_probability[currentIdx] : null;
  const currentUvIndex = typeof current?.uv_index === 'number' ? current.uv_index : (typeof hourly.uv_index?.[currentIdx] === 'number' ? hourly.uv_index[currentIdx] : null);
  const rawCurrentWindSpeed = Math.round(current?.wind_speed_10m ?? hourly.wind_speed_10m?.[currentIdx] ?? 0);
  const currentWindGusts = Math.round(current?.wind_gusts_10m ?? hourly.wind_gusts_10m?.[currentIdx] ?? 0);
  const currentWindDirection = current?.wind_direction_10m ?? hourly.wind_direction_10m?.[currentIdx] ?? 0;
  const rawCurrentHumidity = current?.relative_humidity_2m ?? hourly.relative_humidity_2m?.[currentIdx] ?? 0;
  const rawCurrentPressure = Math.round(current?.pressure_msl ?? hourly.pressure_msl?.[currentIdx] ?? 1029);

  const stationSource = selectedStationOverride || {
    id: "station-local",
    name: `Stacja Telemetryczna IMGW ${city || "Lokalna"} (3.2 km)`,
    temp: rawCurrentTemp,
    humidity: rawCurrentHumidity,
    windSpeed: rawCurrentWindSpeed,
    pressure: rawCurrentPressure,
    distance: "3.2 km"
  };

  const stTemp = stationSource.temp;
  const stHumidity = stationSource.humidity;
  const stWind = stationSource.windSpeed;
  const stPressure = stationSource.pressure || rawCurrentPressure;

  const currentTemp = selectedStationOverride 
    ? Math.round(0.9 * stTemp + 0.1 * rawCurrentTemp)
    : rawCurrentTemp;

  const currentApparentTemp = selectedStationOverride 
    ? Math.round(currentTemp + 2) 
    : rawCurrentApparentTemp;

  const currentHumidity = selectedStationOverride 
    ? Math.round(0.9 * stHumidity + 0.1 * rawCurrentHumidity)
    : rawCurrentHumidity;

  const currentWindSpeed = selectedStationOverride 
    ? Math.round(0.9 * stWind + 0.1 * rawCurrentWindSpeed)
    : rawCurrentWindSpeed;

  const currentPressure = phoneBarometer 
    ? Math.round(0.5 * stPressure + 0.5 * phoneBarometer)
    : stPressure;

  const discomfortIndex = Number((currentTemp - 0.55 * (1 - 0.01 * currentHumidity) * (currentTemp - 14.4)).toFixed(1));

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

  const luxCloudRes = sensorLux !== null ? calculateLuxCloudCover(sensorLux, isDay, measurementLocation) : null;

  let wyswietlaneZachmurzenie = manualCloudCover !== null 
    ? manualCloudCover 
    : (luxCloudRes !== null ? luxCloudRes.cloudCover : currentCloudCover);

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
      return daily.temperature_2m_max?.[0] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_max?.[0] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp]);

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
      return daily.temperature_2m_min?.[0] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_min?.[0] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp]);

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
      return daily.temperature_2m_min?.[0] ?? currentTemp;
    } catch (e) {
      return daily.temperature_2m_min?.[0] ?? currentTemp;
    }
  }, [hourly, daily, currentTemp]);

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

  const getUvIndexDescription = (uv: number) => {
    if (uv < 3) return "Niskie";
    if (uv < 6) return "Umiarkowane";
    if (uv < 8) return "Wysokie";
    if (uv < 11) return "B. Wysokie";
    return "Ekstremalne";
  };

  const getWindDirection = (deg: number) => {
    const directions = ["Północny (N)", "Północno-Wschodni (NE)", "Wschodni (E)", "Południowo-Wschodni (SE)", "Południowy (S)", "Południowo-Zachodni (SW)", "Zachodni (W)", "Północno-Zachodni (NW)"];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  const getDiscomfortDetails = (di: number) => {
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

  const activeCloudCover = manualCloudCover !== null ? manualCloudCover : currentCloudCover;
  const currentWeatherMeta = getWeatherMeta(wCode, isDay, activeCloudCover);

  let displayOpis = luxCloudRes !== null && manualCloudCover === null ? luxCloudRes.label : currentWeatherMeta.text;
  let displayIkonka = luxCloudRes !== null && manualCloudCover === null ? luxCloudRes.icon : currentWeatherMeta.emoji;

  const lowCloud = hourly.cloud_cover_low?.[currentIdx] ?? current.cloud_cover_low ?? 0;
  const midCloud = hourly.cloud_cover_mid?.[currentIdx] ?? current.cloud_cover_mid ?? 0;
  const highCloud = hourly.cloud_cover_high?.[currentIdx] ?? current.cloud_cover_high ?? 0;

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
  const visibilityFromApi = current.visibility ?? hourly.visibility?.[currentIdx];
  let rawVisKm = visibilityFromApi ? Math.round(visibilityFromApi / 1000) : 20;
  // If no fog (wCode 40-49), no rain, and humidity <= 92%, clear air visibility should be realistic (at least 15-30km)
  const isFogOrRain = (wCode >= 40 && wCode <= 49) || currentPrecipitation > 0 || rawCurrentHumidity > 92;
  if (!isFogOrRain && rawVisKm < 10) {
    rawVisKm = Math.round(18 + (100 - wyswietlaneZachmurzenie) * 0.12);
  }
  const visibilityKm = rawVisKm;

  // UV index from meteo source
  let displayUv = "Brak danych";
  let uvVal = 0;
  if (currentUvIndex !== null && typeof currentUvIndex === 'number') {
    uvVal = isDay ? Math.max(0, currentUvIndex) : 0;
    let uvOpis = "Niskie";
    if (uvVal >= 3 && uvVal < 6) uvOpis = "Umiarkowane";
    if (uvVal >= 6 && uvVal < 8) uvOpis = "Wysokie";
    if (uvVal >= 8 && uvVal < 11) uvOpis = "B. Wysokie";
    if (uvVal >= 11) uvOpis = "Ekstremalne";
    displayUv = `${uvVal.toFixed(1)} — ${uvOpis}`;
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
          let cloudCover = (hourly.cloud_cover && typeof hourly.cloud_cover[idx] === 'number') ? hourly.cloud_cover[idx] : 0;
          const precip = (hourly.precipitation && typeof hourly.precipitation[idx] === 'number') ? hourly.precipitation[idx] : 0;
          const rawCode = hourly.weather_code[idx];

          if (precip > 0 || pop >= 30 || rawCode >= 50) {
            cloudCover = Math.max(cloudCover, precip >= 0.5 || pop >= 60 ? 85 : 70);
          } else {
            cloudCover = Math.min(100, Math.max(0, Math.round(cloudCover)));
          }

          const sanitizedCode = sanitizeHourCode(rawCode, pop, precip, cloudCover);

          return {
            timeStr: t,
            hourLabel: new Date(t).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
            temp: hourly.temperature_2m[idx],
            code: sanitizedCode,
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
  const globalMinTemp = Math.min(...(daily.temperature_2m_min || [0]));
  const globalMaxTemp = Math.max(...(daily.temperature_2m_max || [30]));
  const globalTempRange = Math.max(1, globalMaxTemp - globalMinTemp);

  // Deep Tech Blue theme background
  let bgGradientColors = ["#0b1437", "#0d1b4b", "#090d25"];
  if (wCode === 0 && isDay) {
    bgGradientColors = ["#0b1437", "#1e40af", "#0f172a"]; // Sunny bright blue
  } else if (wCode >= 51) {
    bgGradientColors = ["#0b1437", "#0f172a", "#1e293b"]; // Moody dark rainy
  } else if (wCode >= 1 && wCode <= 3) {
    bgGradientColors = ["#0b1437", "#111c44", "#1e293b"]; // Cloudy slate
  }

  return (
    <motion.div 
      animate={{ 
        background: [
          `linear-gradient(to bottom, ${bgGradientColors[0]}, ${bgGradientColors[1]}, ${bgGradientColors[2]})`,
          `linear-gradient(to bottom, ${bgGradientColors[1]}, ${bgGradientColors[2]}, ${bgGradientColors[0]})`,
          `linear-gradient(to bottom, ${bgGradientColors[0]}, ${bgGradientColors[1]}, ${bgGradientColors[2]})`
        ]
      }}
      transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      className={`flex flex-col h-full overflow-hidden transition-all duration-700 relative`}
    >
      {/* Ambient weather effects (rain, snow, sun, clouds, stars) */}
      <AmbientWeatherEffect weatherCode={current.weather_code} isDay={isDay} cloudCover={wyswietlaneZachmurzenie} />

      <div className="flex-1 overflow-y-auto p-4 pb-40 z-10 scroll-smooth">
        {/* Location Detection Notification Toast */}
        <AnimatePresence>
          {locationToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="mb-4 p-3 bg-blue-900/90 border border-blue-400/40 backdrop-blur-xl rounded-2xl text-white text-xs font-semibold shadow-xl flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <Locate className="w-4 h-4 text-blue-300 animate-pulse" />
                <span>{locationToast}</span>
              </div>
              <button 
                onClick={() => setLocationToast(null)}
                className="text-slate-400 hover:text-white ml-2 text-xs"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header with non-overlapping responsive layout */}
        <div className="flex flex-col space-y-4 mb-6">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between gap-2">
            {/* Left Controls: Search & GPS */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={onBackToSearch}
                className="p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 flex items-center justify-center"
                title="Wyszukaj miejscowość z listy"
                id="btn-back-to-search"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={handleAutoDetectLocation}
                disabled={isLocating}
                className="p-2.5 sm:p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-2xl text-blue-300 hover:text-white transition-all active:scale-95 flex items-center justify-center relative overflow-hidden"
                title="Wykryj moją automatyczną lokalizację (GPS / IP)"
                id="btn-auto-detect-gps"
              >
                {isLocating ? (
                  <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-blue-400" />
                ) : (
                  <Locate className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                )}
              </button>
            </div>

            {/* Right Controls: PWA, LCD, QR, Refresh */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
              <button
                onClick={() => {
                  const banner = document.getElementById('pwa-install-banner');
                  if (banner) {
                    banner.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    alert("Aby zainstalować aplikację na telefonie, wybierz opcję 'Dodaj do ekranu początkowego' / 'Zainstaluj' w menu przeglądarki.");
                  }
                }}
                className="p-2.5 sm:p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-2xl text-blue-400 hover:text-blue-300 transition-all active:scale-95 flex items-center justify-center"
                title="Zainstaluj aplikację na telefonie (PWA)"
                id="btn-header-install"
              >
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => setShowLcdConsole(!showLcdConsole)}
                className={`p-2.5 sm:p-3 border rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-1.5 font-extrabold text-xs shadow-lg cursor-pointer ${
                  showLcdConsole 
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-amber-500/30" 
                    : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40"
                }`}
                title="Przełącz tryb widoku: [Tryb: Nowoczesny] / [Tryb: Konsola LCD]"
                id="btn-toggle-lcd-console"
              >
                <Tv className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                <span className="hidden md:inline font-mono">{showLcdConsole ? "Tryb: Stacja LCD" : "Tryb: Nowoczesny"}</span>
              </button>

              <button
                onClick={() => setIsQrModalOpen(true)}
                className="p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 flex items-center justify-center"
                title="Pokaż kod QR"
                id="btn-show-qr"
              >
                <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </button>

              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center group"
                title="Odśwież pogodę"
                id="btn-refresh"
              >
                <RotateCw className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-700 ${isRefreshing ? "animate-spin" : "group-active:rotate-180"}`} />
              </button>
            </div>
          </div>

          {/* Centered Location Info */}
          <div className="flex flex-col items-center text-center w-full px-2">
            <div className="flex items-center space-x-1.5 mb-1 cursor-pointer" onClick={handleAutoDetectLocation} title="Kliknij, aby odświeżyć pozycję GPS">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest whitespace-nowrap">
                Twoja Lokalizacja
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tighter leading-snug w-full text-center mb-1 cursor-pointer break-words" title={city} onClick={handleAutoDetectLocation}>
              {getCityLocationString(city)}
            </h2>
            
            {data.lastUpdated && (
              <div className="flex flex-col items-center space-y-2 mt-1">
                <div id="last-update" className="text-[10px] text-slate-400/80 flex items-center tracking-tight font-medium">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                  Zaktualizowano {new Date(data.lastUpdated).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-slate-800/60 backdrop-blur-md border border-slate-700/50 rounded-full">
                    <Wifi className="w-2.5 h-2.5 text-slate-400" />
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
                      { (data.activeServers || data.weather?.activeServers || ["Serwer Główny"])[0].split(" ")[0] }
                    </span>
                  </div>

                  <button 
                    onClick={() => setIsFusionModalOpen(true)}
                    className="text-[9px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Cpu className="w-2.5 h-2.5 text-blue-400" />
                    <span>Fuzja {current.fusion_metadata ? `${Math.round(current.fusion_metadata.confidence_score)}%` : 'Aktywna'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hero Current Weather & Station Console Section */}
        <div id="main-weather-content" className="p-4 sm:p-6 lg:p-8 relative overflow-hidden">
          {/* Animated Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.1, 0.2, 0.1]
              }}
              transition={{ duration: 10, repeat: Infinity }}
              className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]"
            />
            <motion.div 
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.05, 0.15, 0.05]
              }}
              transition={{ duration: 15, repeat: Infinity, delay: 2 }}
              className="absolute -bottom-48 -right-48 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]"
            />
          </div>

          {/* Station Console Header */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center mb-6 text-center max-w-4xl mx-auto"
          >
            {/* Weather Icon & Temperature Banner */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-4">
              <div className="relative group p-6 rounded-[32px] bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.2)] transition-transform duration-500 hover:scale-105">
                <AiWeatherIcon 
                  code={wCode}
                  isDay={isDay}
                  cloudCover={wyswietlaneZachmurzenie}
                  precip={currentPrecipitation}
                  className="w-24 h-24 sm:w-28 sm:h-28 relative z-10"
                  size="lg"
                />
                <div className="absolute inset-0 bg-blue-400/5 rounded-[32px] blur-2xl -z-10 group-hover:bg-blue-400/10 transition-colors" />
              </div>

              <div className="text-center sm:text-left space-y-1">
                <div className="flex items-start justify-center sm:justify-start">
                  <span id="temp" className="text-7xl sm:text-8xl font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] leading-none">
                    {currentTemp}
                  </span>
                  <span className="text-3xl font-light text-slate-400 mt-2 ml-1">°C</span>
                </div>
                <p id="desc" className="text-xl font-bold text-slate-100 capitalize tracking-tight flex items-center justify-center sm:justify-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  {displayOpis}
                </p>
                <div id="apparent" className="text-sm text-slate-400 font-medium flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
                  <span className="flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                    {isDay ? "W słońcu" : "Odczuwalna"}: <strong className="text-slate-200">{currentApparentTemp}°</strong>
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-700 hidden sm:block" />
                  <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
                    <ArrowUp className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] uppercase text-slate-400 font-bold">Max:</span>
                    <span className="text-slate-100 font-bold">{Math.round(todayMaxTemp)}°</span>
                    <span className="mx-1.5 text-slate-700">|</span>
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] uppercase text-slate-400 font-bold">Noc:</span>
                    <span className="text-slate-100 font-bold">{Math.round(upcomingNightTemp)}°</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Primary Metrics Capsule Row */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 max-w-xl w-full">
              <div className="px-3.5 py-1.5 bg-cyan-500/20 border border-cyan-400/40 rounded-2xl text-xs font-bold text-cyan-200 flex items-center space-x-1.5 shadow-md">
                <Cloud className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>Zachmurzenie: <strong className="text-white font-black text-sm">{wyswietlaneZachmurzenie}%</strong></span>
              </div>

              <div className="px-3.5 py-1.5 bg-blue-500/20 border border-blue-400/40 rounded-2xl text-xs font-bold text-blue-200 flex items-center space-x-1.5 shadow-md">
                <CloudRain className="w-4 h-4 text-blue-300 shrink-0" />
                <span>Opady: <strong className="text-white font-black">{currentPop}%</strong> ({currentPrecipitation} mm)</span>
              </div>

              <div className="px-3.5 py-1.5 bg-amber-500/20 border border-amber-400/40 rounded-2xl text-xs font-bold text-amber-200 flex items-center space-x-1.5 shadow-md">
                <Sun className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Indeks UV: <strong className="text-white font-black">{uvVal.toFixed(1)}</strong></span>
              </div>

              <div className="px-3.5 py-1.5 bg-teal-500/20 border border-teal-400/40 rounded-2xl text-xs font-bold text-teal-200 flex items-center space-x-1.5 shadow-md">
                <Wind className="w-4 h-4 text-teal-300 shrink-0" />
                <span>Wiatr: <strong className="text-white font-black">{currentWindSpeed} km/h</strong></span>
              </div>
            </div>

            {/* Quick Sky Camera Measurement & Indoor/Outdoor Selector */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2 max-w-lg w-full">
              <div className="flex items-center justify-center p-1 bg-white/5 border border-white/10 rounded-2xl w-full text-xs backdrop-blur-sm">
                <button
                  onClick={() => handleToggleLocation("indoor")}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    measurementLocation === "indoor"
                      ? "bg-amber-500/25 text-amber-200 border border-amber-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>🏠</span>
                  <span>Za szybą (Wewnątrz)</span>
                </button>

                <button
                  onClick={() => handleToggleLocation("outdoor")}
                  className={`flex-1 py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    measurementLocation === "outdoor"
                      ? "bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>☀️</span>
                  <span>Plener (Na zewnątrz)</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => handleQuickCameraLuxMeasurement()}
                  disabled={isMeasuringCameraLux}
                  className="flex-1 sm:flex-none py-2 px-3 bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-500 hover:to-cyan-500 border border-cyan-400/30 rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2 shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Camera className={`w-3.5 h-3.5 ${isMeasuringCameraLux ? "animate-spin text-cyan-300" : ""}`} />
                  <span>{isMeasuringCameraLux ? "Mierzę..." : "📷 Fotometr z aparatu"}</span>
                </button>

                <button
                  onClick={() => setIsPwaModalOpen(true)}
                  className="py-2 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center space-x-1 transition-all active:scale-95 cursor-pointer"
                  title="Instrukcja PWA i diagnostyka błędów"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Pomoc</span>
                </button>
              </div>
            </div>

            {/* Photometer Calibration Badge */}
            {sensorLux !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-3 w-full max-w-lg p-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs text-amber-200 shadow-lg"
              >
                <div className="flex items-center space-x-2 text-left">
                  <Sun className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                  <div>
                    <p className="font-extrabold text-amber-100 text-xs">
                      ⚡ Skorygowano fotometrem ({measurementLocation === 'indoor' ? 'Za szybą' : 'Na zewnątrz'})!
                    </p>
                    <p className="text-[11px] text-amber-300/90">
                      Odczyt: <strong>{sensorLux} Lux</strong> &rarr; <strong>{wyswietlaneZachmurzenie}% chmur</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSensorLux(null)}
                  className="ml-2 px-2.5 py-1 bg-amber-500/25 hover:bg-amber-500/45 border border-amber-400/50 rounded-xl text-[10px] font-bold text-amber-100 transition-all cursor-pointer whitespace-nowrap"
                >
                  Resetuj
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>

          {/* Main View Mode Selector Tabs */}
          <div className="max-w-5xl mx-auto mb-6 px-1 flex items-center justify-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
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
            <div className="max-w-5xl mx-auto mb-8">
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
              {/* AI INSIGHT SECTION (MODERN BENTO) */}
              <div className="max-w-5xl mx-auto mb-10">
              </div>

              {/* GŁÓWNY PULPIT METEO (SATELLITE TELEMETRY STYLE) */}
              <div className="max-w-5xl mx-auto mb-10 [perspective:2000px]">
                <motion.div 
                  initial={{ rotateX: 10, y: 20, opacity: 0 }}
                  animate={{ rotateX: 0, y: 0, opacity: 1 }}
                  whileHover={{ rotateX: 2, rotateY: -2, translateZ: 20 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="bg-[#111c44]/60 border border-white/20 rounded-[32px] p-6 backdrop-blur-2xl mb-8 relative overflow-hidden group shadow-[0_40px_80px_rgba(0,0,0,0.5)]"
                >
                  {/* Scanning Light Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent -translate-x-full group-hover:animate-scan pointer-events-none" />
                  
                  <div className="relative z-10">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-8 gap-6">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/30 to-blue-500/30 rounded-2xl flex items-center justify-center border border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.3)] group-hover:rotate-6 transition-transform">
                          <Activity className="w-6 h-6 text-indigo-400 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white tracking-tighter uppercase italic">Aura Fusion 3D</h3>
                          <div className="flex items-center space-x-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                            <p className="text-[9px] text-indigo-300 font-black uppercase tracking-widest">
                              Lokalizacja: {getCityLocationString(city)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex flex-col items-end shadow-xl backdrop-blur-md">
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</span>
                          <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Aktywny</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <motion.div 
                        whileHover={{ translateZ: 30, rotateX: -5 }}
                        className="bg-gradient-to-b from-white/10 to-white/5 p-3 rounded-xl border border-white/10 hover:border-white/30 transition-all shadow-2xl [transform-style:preserve-3d]"
                      >
                        <p className="text-[9px] text-indigo-300 font-black uppercase mb-1.5 tracking-widest">Satelity</p>
                        <div className="flex items-center space-x-2">
                          <Globe className="w-4 h-4 text-indigo-400" />
                          <span className="text-sm font-black text-white">6 GEO</span>
                        </div>
                      </motion.div>
                      
                      <motion.div 
                        whileHover={{ translateZ: 30, rotateX: -5 }}
                        className="bg-gradient-to-b from-white/10 to-white/5 p-3 rounded-xl border border-white/10 hover:border-white/30 transition-all shadow-2xl [transform-style:preserve-3d]"
                      >
                        <p className="text-[9px] text-emerald-300 font-black uppercase mb-1.5 tracking-widest">Gleba</p>
                        <div className="flex items-center space-x-2">
                          <Zap className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-black text-white">{current.soil_moisture_satellite ?? 25}%</span>
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ translateZ: 30, rotateX: -5 }}
                        className="bg-gradient-to-b from-white/10 to-white/5 p-3 rounded-xl border border-white/10 hover:border-white/30 transition-all shadow-2xl [transform-style:preserve-3d]"
                      >
                        <p className="text-[9px] text-cyan-300 font-black uppercase mb-1.5 tracking-widest">Chmury</p>
                        <div className="flex items-center space-x-2">
                          <Activity className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-black text-white">{wyswietlaneZachmurzenie}%</span>
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ translateZ: 30, rotateX: -5 }}
                        className="bg-gradient-to-b from-white/10 to-white/5 p-3 rounded-xl border border-white/10 hover:border-white/30 transition-all shadow-2xl [transform-style:preserve-3d]"
                      >
                        <p className="text-[9px] text-amber-300 font-black uppercase mb-1.5 tracking-widest">Data</p>
                        <div className="flex items-center space-x-2">
                          <Radio className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-black text-white">Live</span>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              </div>

                {/* Modern Bento Grid Hierarchy */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12 [perspective:3000px] [transform-style:preserve-3d]">
                  
                  {/* Primary Focus: Temperature & Atmosphere (Large Card) */}
                  <motion.div 
                    initial={{ rotateX: 5, y: 30, opacity: 0 }}
                    animate={{ rotateX: 0, y: 0, opacity: 1 }}
                    whileHover={{ rotateY: -3, rotateX: 3, translateZ: 50, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 150, damping: 15 }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="md:col-span-2 bg-gradient-to-br from-indigo-600/20 to-blue-600/10 border border-white/20 rounded-[40px] p-8 backdrop-blur-2xl shadow-[0_50px_100px_rgba(0,0,0,0.6)] relative overflow-hidden group hover:border-indigo-500/50 transition-all duration-500"
                  >
                    <div className="absolute top-0 right-0 p-6 opacity-20 scale-110 group-hover:scale-100 transition-transform duration-1000 pointer-events-none blur-sm" style={{ transform: "translateZ(80px)" }}>
                      <AiWeatherIcon code={wCode} isDay={isDay} className="w-32 h-32" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
                      <div className="text-center md:text-left" style={{ transform: "translateZ(40px)" }}>
                        <div className="flex items-center justify-center md:justify-start space-x-3 mb-6">
                          <div className="p-2.5 bg-indigo-500/30 rounded-xl border border-indigo-500/40 shadow-xl">
                            <Thermometer className="w-5 h-5 text-indigo-400" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Termometria 3D</span>
                        </div>
                        <div className="flex items-end justify-center md:justify-start space-x-5 mb-4">
                          <h2 className="text-[64px] sm:text-[72px] font-black text-white tracking-tighter leading-none drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)]">{Math.round(currentTemp)}°</h2>
                          <div className="pb-2">
                            <p className="text-xl font-black text-white uppercase italic tracking-tighter">{displayOpis}</p>
                            <p className="text-xs text-slate-400 font-bold tracking-tight">Odczuwalna: {Math.round(currentApparentTemp)}°</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
                        <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center justify-center min-w-[120px]">
                          <span className="text-[9px] text-slate-500 font-black uppercase mb-1">Index DI</span>
                          <span className={`text-lg font-black ${discomfortMeta.color.split(' ')[0]}`}>{discomfortIndex}°</span>
                          <span className="text-[8px] text-slate-500 font-bold">{discomfortMeta.label}</span>
                        </div>
                        <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center justify-center min-w-[120px]">
                          <span className="text-[9px] text-slate-500 font-black uppercase mb-1">UV</span>
                          <span className="text-lg font-black text-amber-400">{currentUvIndex}</span>
                          <span className="text-[8px] text-slate-500 font-bold">Indeks</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Secondary Insights Grid */}
                  <div className="lg:col-span-1 space-y-8 [transform-style:preserve-3d]">
                    {/* Tile 2: Dynamika Wiatru & Ciśnienia (Combined Modern) */}
                    <motion.div 
                      whileHover={{ scale: 1.05, translateZ: 40, rotateY: 5 }}
                      style={{ transformStyle: "preserve-3d" }}
                      className="bg-white/5 border border-white/10 rounded-[40px] p-8 backdrop-blur-xl shadow-2xl hover:border-white/30 transition-all"
                    >
                      <div className="flex items-center justify-between mb-8" style={{ transform: "translateZ(20px)" }}>
                        <div className="flex items-center space-x-3">
                          <div className="p-3 bg-cyan-500/30 rounded-2xl border border-cyan-400/40">
                            <Wind className="w-5 h-5 text-cyan-400" />
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">Aero-Kinetyka</span>
                        </div>
                      </div>

                      <div className="space-y-8" style={{ transform: "translateZ(30px)" }}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <span className="text-[10px] text-slate-500 font-black block uppercase tracking-widest">Barometr</span>
                            <div className="flex items-baseline space-x-1">
                              <span className="text-3xl font-black text-white">{currentPressure}</span>
                              <span className="text-xs text-slate-400 font-bold">hPa</span>
                            </div>
                          </div>
                          <div className="w-px h-12 bg-white/10" />
                          <div className="space-y-2 text-right">
                            <span className="text-[10px] text-slate-500 font-black block uppercase tracking-widest">Przepływ</span>
                            <div className="flex items-baseline justify-end space-x-1">
                              <span className="text-3xl font-black text-white">{currentWindSpeed}</span>
                              <span className="text-xs text-slate-400 font-bold">km/h</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/[0.04] p-5 rounded-3xl border border-white/10 shadow-inner">
                          <WindCompassRose 
                            speed={currentWindSpeed}
                            gusts={currentWindGusts}
                            degrees={currentWindDirection}
                            directionText={windDirText}
                          />
                        </div>
                      </div>
                    </motion.div>

                    {/* Tile 4: Wilgotność & Środowisko (Modern) */}
                    <motion.div 
                      whileHover={{ scale: 1.05, translateZ: 40, rotateX: -5 }}
                      style={{ transformStyle: "preserve-3d" }}
                      className="bg-white/5 border border-white/10 rounded-[40px] p-8 backdrop-blur-xl shadow-2xl flex flex-col justify-between hover:border-white/30 transition-all"
                    >
                      <div className="flex items-center space-x-3 mb-8" style={{ transform: "translateZ(20px)" }}>
                        <div className="p-3 bg-blue-500/30 rounded-2xl border border-blue-400/40">
                          <Droplets className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">Hydro-Status</span>
                      </div>

                      <div className="grid grid-cols-1 gap-6" style={{ transform: "translateZ(30px)" }}>
                        <div className="bg-gradient-to-br from-white/10 to-white/5 p-5 rounded-3xl border border-white/10">
                          <span className="text-[10px] text-slate-500 font-black block mb-2 uppercase tracking-widest">Powietrze (RH)</span>
                          <div className="flex items-baseline justify-between">
                            <span className="text-3xl font-black text-white">{currentHumidity}%</span>
                            <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${currentHumidity}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-5 rounded-3xl border border-emerald-500/20">
                          <span className="text-[10px] text-slate-500 font-black block mb-2 uppercase tracking-widest">Gleba (Sentinel)</span>
                          <div className="flex items-baseline justify-between">
                            <span className="text-3xl font-black text-emerald-400">{current.soil_moisture_satellite ?? 25}%</span>
                            <span className="text-[10px] text-emerald-500/50 font-black">ACTIVE</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                    {/* Tile 6: Atmosfera & Słońce (Modern) */}
                    <motion.div 
                      whileHover={{ scale: 1.05, translateZ: 40, rotateY: -5 }}
                      style={{ transformStyle: "preserve-3d" }}
                      className="bg-white/5 border border-white/10 rounded-[40px] p-8 backdrop-blur-xl shadow-2xl hover:border-white/30 transition-all"
                    >
                      <div className="flex items-center space-x-3 mb-8" style={{ transform: "translateZ(20px)" }}>
                        <div className="p-3 bg-amber-500/30 rounded-2xl border border-amber-500/40">
                          <Sun className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">Helio-Atmosfera</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4" style={{ transform: "translateZ(30px)" }}>
                        <div className="bg-white/[0.04] p-4 rounded-3xl border border-white/10">
                          <span className="text-[10px] text-slate-500 font-black block uppercase mb-1 tracking-widest">Chmury</span>
                          <span className="text-xl font-black text-white">{wyswietlaneZachmurzenie}%</span>
                        </div>
                        <div className="bg-white/[0.04] p-4 rounded-3xl border border-white/10">
                          <span className="text-[10px] text-slate-500 font-black block uppercase mb-1 tracking-widest">Widoczność</span>
                          <span className="text-xl font-black text-white">{visibilityKm}km</span>
                        </div>
                        <div className="bg-gradient-to-br from-amber-500/10 to-transparent p-4 rounded-3xl border border-white/10 col-span-2 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-slate-500 font-black block uppercase mb-1">Wschód</span>
                            <span className="text-sm font-black text-amber-200">
                              {daily?.sunrise && daily.sunrise[0] && !isNaN(new Date(daily.sunrise[0]).getTime())
                                ? new Date(daily.sunrise[0]).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
                                : "05:30"}
                            </span>
                          </div>
                          <div className="w-px h-8 bg-white/10" />
                          <div className="text-right">
                            <span className="text-[9px] text-slate-500 font-black block uppercase mb-1">Zachód</span>
                            <span className="text-sm font-black text-orange-300">
                              {daily?.sunset && daily.sunset[0] && !isNaN(new Date(daily.sunset[0]).getTime())
                                ? new Date(daily.sunset[0]).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
                                : "20:30"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                </div>

              {/* Sekcja Opadów & Ryzyko Deszczu (Radar Opadowy Nowcast) */}
              <div className="max-w-5xl mx-auto mb-8">
                <RainAlertNowcastCard data={data} />
              </div>
            </>
          )}

              {activeRecs.length > 0 && (
                <div className="w-full max-w-5xl mx-auto mb-8">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Rekomendacje Dnia</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{activeRecs.length} PORADY</span>
              </div>
              <div className="flex overflow-x-auto pb-2 gap-4 snap-x no-scrollbar">
                {activeRecs.map(rec => (
                  <motion.div 
                    key={rec.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`min-w-[280px] flex-1 ${rec.color} border rounded-3xl p-5 text-left relative snap-center shadow-lg backdrop-blur-md`}
                  >
                    <div className="bg-white/10 text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full inline-block mb-3 border border-white/5">
                      {rec.type}
                    </div>
                    <p className="text-sm font-bold text-slate-100 leading-relaxed pr-6">
                      {rec.text}
                    </p>
                    <button 
                      onClick={() => setDismissedRecs(prev => [...prev, rec.id])}
                      className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-[11px] font-bold text-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      Zrozumiano ✓
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Weather Parameters */}
          <div className="max-w-5xl mx-auto mb-8">
            <AdditionalWeatherParameters 
              current={{
                ...data.weather.current,
                temperature_2m: currentTemp,
                apparent_temperature: currentApparentTemp,
                cloud_cover: wyswietlaneZachmurzenie,
                visibility: visibilityKm * 1000,
                wind_speed_10m: currentWindSpeed,
                relative_humidity_2m: currentHumidity,
                pressure_msl: currentPressure,
                precipitation: currentPrecipitation
              }} 
            />
          </div>

          {/* Hourly Forecast */}
          <section className="space-y-4 max-w-5xl mx-auto mb-8">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs uppercase tracking-widest text-slate-300 font-bold">Prognoza Godzinowa (24h)</h3>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex overflow-x-auto pb-4 gap-3 snap-x no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x" style={{ willChange: 'scroll-position' }}>
              {calibratedNext24Hours.map((hour, idx) => {
                if (!hour) return null;
                const isNow = idx === 0;
                return (
                  <div 
                    key={idx}
                    className={`min-w-[80px] flex flex-col items-center py-4 px-2.5 rounded-2xl snap-start transition-all border ${isNow ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'}`}
                  >
                    <span className="text-[11px] font-bold text-slate-300 mb-2">{isNow ? 'Teraz' : hour.hourLabel}</span>
                    <AiWeatherIcon 
                      code={hour.code}
                      isDay={new Date(hour.timeStr).getHours() >= 6 && new Date(hour.timeStr).getHours() < 20}
                      cloudCover={hour.cloudCover}
                      precip={hour.precip}
                      className="w-9 h-9 mb-2"
                    />
                    <span className="text-base font-bold text-slate-100">{Math.round(hour.temp)}°</span>
                    <div className="flex items-center mt-1 text-[9px] text-cyan-400 font-bold">
                      <Droplet className="w-2.5 h-2.5 mr-0.5" />
                      {hour.pop}%
                    </div>
                    {hour.precip > 0 && (
                      <div className="flex items-center mt-0.5 text-[9px] text-cyan-300 font-medium">
                        <Droplets className="w-2.5 h-2.5 mr-0.5" />
                        {hour.precip < 0.1 ? `${hour.precip.toFixed(2)} mm` : `${hour.precip.toFixed(1)} mm`}
                      </div>
                    )}
                    <div className="flex items-center mt-0.5 text-[9px] text-blue-300 font-medium">
                      <Cloud className="w-2.5 h-2.5 mr-0.5" />
                      {hour.cloudCover}%
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* AI Assistant - Floating fixed component (one instance at bottom) */}

          {/* Daily 5-Day Forecast */}
          <section className="space-y-4 max-w-5xl mx-auto mb-10">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs uppercase tracking-widest text-slate-300 font-bold">Prognoza 3-dniowa</h3>
              <button 
                onClick={() => setExpandedDayIndex(expandedDayIndex === 'all' ? null : 'all')}
                className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-xl border border-white/10 transition-all active:scale-95 cursor-pointer"
                title="Rozwiń lub zwiń wszystkie dni"
              >
                <span className="text-[9px] text-blue-400 font-bold uppercase tracking-tighter">
                  {expandedDayIndex === 'all' ? 'Zwiń szczegóły' : 'Pokaż szczegóły'}
                </span>
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
              </button>
            </div>
            <div className="space-y-3">
              {daily.time.slice(0, 3).map((day, idx) => {
                const dayName = idx === 0 ? "Dziś" : idx === 1 ? "Jutro" : new Date(day).toLocaleDateString("pl-PL", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
                const dMeta = getWeatherMeta(daily.weather_code[idx], true);
                const isExpanded = expandedDayIndex === 'all' || expandedDayIndex === idx;
                
                return (
                  <div key={day} className="flex flex-col">
                    <div 
                      onClick={() => setExpandedDayIndex(expandedDayIndex === idx ? null : idx)}
                      className={`flex items-center justify-between p-4 border rounded-2xl transition-all cursor-pointer group active:scale-[0.98] ${isExpanded ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'}`}
                    >
                      <div className="flex items-center space-x-3 w-32">
                        <div className="flex flex-col">
                          <span className={`text-sm font-bold transition-colors ${isExpanded ? 'text-blue-400' : 'text-slate-200'}`}>{dayName}</span>
                          <span className="text-[10px] text-slate-400 font-medium truncate max-w-[110px]">{dMeta.text}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <AiWeatherIcon 
                          code={daily.weather_code[idx]}
                          isDay={true}
                          cloudCover={50}
                          className="w-7 h-7"
                        />
                        <div className="flex items-center text-[10px] text-cyan-400 font-bold min-w-[35px]">
                          <Droplet className="w-3 h-3 mr-1" />
                          {daily.precipitation_probability_max[idx]}%
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 min-w-[80px] justify-end">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-slate-100">{Math.round(daily.temperature_2m_max[idx])}°</span>
                          <span className="text-[10px] text-slate-500 font-medium">{Math.round(daily.temperature_2m_min[idx])}°</span>
                        </div>
                        <span className={`text-[10px] transition-transform duration-200 ${isExpanded ? 'text-blue-400 rotate-180' : 'text-slate-600'}`}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 overflow-x-auto scrollbar-none pb-2 touch-pan-x" style={{ willChange: 'scroll-position' }}>
                        <div className="flex space-x-2.5 p-1">
                          {getHourlyForDay(day).map((h, hIdx) => (
                            <div key={hIdx} className="min-w-[70px] flex flex-col items-center p-3 bg-white/[0.03] border border-white/5 rounded-xl text-center">
                              <span className="text-[9px] text-slate-500 font-bold mb-1">{h.hourLabel}</span>
                              <AiWeatherIcon 
                                code={h.code}
                                isDay={new Date(h.timeStr).getHours() >= 6 && new Date(h.timeStr).getHours() < 20}
                                cloudCover={h.cloudCover}
                                precip={h.precip}
                                className="w-7 h-7 my-1"
                              />
                              <span className="text-xs font-bold text-slate-200">{Math.round(h.temp)}°</span>
                              <div className="text-[8px] text-cyan-500/80 font-bold mt-0.5">{h.pop}%</div>
                              {h.precip > 0 && (
                                <div className="text-[8px] text-cyan-300 font-medium">
                                  {h.precip < 0.1 ? `${h.precip.toFixed(2)}mm` : `${h.precip.toFixed(1)}mm`}
                                </div>
                              )}
                              <div className="text-[8px] text-blue-300 font-medium mt-0.5">{h.cloudCover}% chm.</div>
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
          <div className="max-w-5xl mx-auto pt-6 border-t border-white/10">
            {/* High-Tech Tab Switcher Navigation Bar - Modernized for Clarity */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 bg-slate-900/50 p-2 border border-white/10 rounded-[32px] backdrop-blur-xl shadow-2xl">
              <div className="flex items-center space-x-1 w-full md:w-auto">
                <button
                  onClick={() => setActiveTab('satellites')}
                  className={`flex-1 md:flex-none py-3 px-6 rounded-[24px] text-xs font-bold flex items-center justify-center space-x-2.5 transition-all duration-300 cursor-pointer ${
                    activeTab === 'satellites'
                      ? "bg-white text-slate-900 shadow-xl shadow-white/10 scale-[1.02]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-satellites"
                >
                  <Waves className={`w-4 h-4 ${activeTab === 'satellites' ? 'text-indigo-600' : 'text-blue-400'}`} />
                  <span>Radar i Satelity</span>
                </button>

                <button
                  onClick={() => setActiveTab('agro')}
                  className={`flex-1 md:flex-none py-3 px-6 rounded-[24px] text-xs font-bold flex items-center justify-center space-x-2.5 transition-all duration-300 cursor-pointer ${
                    activeTab === 'agro'
                      ? "bg-white text-slate-900 shadow-xl shadow-white/10 scale-[1.02]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-agro"
                >
                  <Sprout className={`w-4 h-4 ${activeTab === 'agro' ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  <span>Agro i Środowisko</span>
                </button>

                <button
                  onClick={() => setActiveTab('diagnostics')}
                  className={`flex-1 md:flex-none py-3 px-6 rounded-[24px] text-xs font-bold flex items-center justify-center space-x-2.5 transition-all duration-300 cursor-pointer ${
                    activeTab === 'diagnostics'
                      ? "bg-white text-slate-900 shadow-xl shadow-white/10 scale-[1.02]"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  id="tab-diagnostics"
                >
                  <Settings className={`w-4 h-4 ${activeTab === 'diagnostics' ? 'text-purple-600' : 'text-purple-400'}`} />
                  <span>Diagnostyka Systemu</span>
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
                        soilMoistureSat={current.soil_moisture_satellite ?? 25}
                        cloudCoverSat={wyswietlaneZachmurzenie}
                      />
                      <WeatherSourceComparison 
                        sourcesData={data.sourcesData}
                        currentTemp={currentTemp}
                        currentCloud={wyswietlaneZachmurzenie}
                        currentWind={current.wind_speed_10m}
                        lat={userLat}
                        lng={userLng}
                        initialMode="fusion"
                        onStationChange={setSelectedStationOverride}
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
                    currentWind={current.wind_speed_10m}
                    lat={userLat}
                    lng={userLng}
                    initialMode="stations"
                    onStationChange={setSelectedStationOverride}
                  />
                  <HeatStressTomorrowCard hourly={hourly} daily={daily} />
                  <NowcastPrecipitationAlert hourly={hourly} />
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
                  <DeviceSensorsCard 
                    currentTemp={currentTemp}
                    currentPressure={currentPressure || 1029}
                    userLat={userLat}
                    userLng={userLng}
                    locationName={city}
                    onGpsUpdate={(lat, lng) => onLocationSelected?.(lat, lng)}
                    onLuxUpdate={(lux) => setSensorLux(lux)}
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
          stationName: stationSource.name,
          stationDistance: stationSource.distance,
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
          fusionMetadata: current.fusion_metadata
        }}
      />

      <WeatherAlertsToast data={data} />
    </div>
  </motion.div>
  );
}
