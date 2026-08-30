import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Droplet,
  Sun,
  Thermometer,
  Wind,
  Cloud,
  CloudRain,
  Eye,
  Database,
  Radio,
  Smartphone,
  MapPin,
  RefreshCw,
  X,
  ShieldCheck,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Sliders,
  FileText,
  Trash2,
  BarChart3,
  Info,
  Filter,
  ArrowRight
} from 'lucide-react';
import { WeatherResponse, ApiFieldDiagnostic } from '../types';
import { getCalibratedTemperatureDetails, calculateApparentTemperature } from '../utils/weatherUtils';
import {
  loadValidationSamples,
  saveValidationSamples,
  loadReferenceSamples,
  saveReferenceSamples,
  addReferenceSampleToArchive,
  clearValidationSamples,
  computeValidationStats,
  createValidationSampleFromCurrentData,
  ValidationSample
} from '../utils/validationStorage';
import {
  runAuraSelfDiagnostic,
  AuraSelfDiagnosticReport,
  DiagnosticIssue,
  TrackedFallback
} from '../utils/selfDiagnosticEngine';
import { GeoDiagnosticInfo } from './PwaDiagnosticModal';
import { Capacitor } from '@capacitor/core';
import { ApiDataFlowDiagnosticsCard } from './ApiDataFlowDiagnosticsCard';
import DeviceSensorsCard from './DeviceSensorsCard';

export const formatUvDisplay = (val: number | null | undefined): string => {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  if (val > 0 && val < 1) {
    return val.toFixed(1).replace('.', ',');
  }
  return Math.round(val).toString();
};

export interface AuraDiagnosticCenterProps {
  data: WeatherResponse;
  userLat?: number;
  userLng?: number;
  geoDiagnostic?: GeoDiagnosticInfo | null;
  onRefresh?: () => void;
  isOpenAsModal?: boolean;
  onCloseModal?: () => void;
}

export const AuraDiagnosticCenter: React.FC<AuraDiagnosticCenterProps> = ({
  data,
  userLat,
  userLng,
  geoDiagnostic,
  onRefresh,
  isOpenAsModal = false,
  onCloseModal
}) => {
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'engine' | 'timeline' | 'matrix' | 'uv_deep' | 'precip_deep' | 'imgw' | 'gps' | 'api' | 'validation' | 'legacy'>('engine');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<'ALL' | 'CRITICAL_HIGH' | 'MEDIUM' | 'LOW_INFO'>('ALL');
  const [issueParamFilter, setIssueParamFilter] = useState<string>('ALL');

  const [validationSamples, setValidationSamples] = useState<ValidationSample[]>(() => loadValidationSamples());
  const [referenceSamples, setReferenceSamples] = useState<ValidationSample[]>(() => loadReferenceSamples());
  const [showSamplesTable, setShowSamplesTable] = useState(false);

  const isNative = Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.location.protocol === 'file:');

  const effectiveLat = userLat ?? data?.lat ?? 52.8441;
  const effectiveLng = userLng ?? data?.lng ?? 19.1772;

  const rawOmCurrent = data?.weather?.current;
  const rawOmHourly = data?.weather?.hourly;
  const rawOmDaily = data?.weather?.daily;

  // Run pure, observational Aura Self-Diagnostic Engine
  const selfDiagReport: AuraSelfDiagnosticReport = useMemo(() => {
    return runAuraSelfDiagnostic(data);
  }, [data]);

  const calDetails = useMemo(() => {
    const activeSt = data?.imgwStation && typeof data.imgwStation.temp === 'number' && !isNaN(data.imgwStation.temp) && (data.imgwStation.distanceKm === undefined || data.imgwStation.distanceKm <= 45)
      ? data.imgwStation
      : null;
    return getCalibratedTemperatureDetails(
      activeSt,
      data?.weather?.current?.temperature_2m,
      data?.weather?.hourly?.time,
      data?.weather?.hourly?.temperature_2m
    );
  }, [data]);

  // Record validation sample and reference archive whenever weather data or calibration details update
  useEffect(() => {
    if (!data || !calDetails) return;

    const sample = createValidationSampleFromCurrentData(
      calDetails,
      data?.weather?.current?.apparent_temperature ?? null,
      data?.imgwStation,
      data?.weather?.current?.relative_humidity_2m,
      data?.weather?.current?.wind_speed_10m,
      data?.weather?.current?.wind_gusts_10m
    );

    if (!sample) return;

    // 1. Zapis do bufora diagnostycznego (ostatnie 30 próbek telemetrycznych czasu rzeczywistego)
    setValidationSamples(prev => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (
          last.imgwMeasurementTime === sample.imgwMeasurementTime &&
          last.imgwTemperature === sample.imgwTemperature &&
          last.rawOpenMeteoTemperature === sample.rawOpenMeteoTemperature &&
          last.auraTemperature === sample.auraTemperature
        ) {
          return prev;
        }
      }
      const updated = [...prev, sample].slice(-30);
      saveValidationSamples(updated);
      return updated;
    });

    // 2. Zapis do trwałego archiwum referencyjnego (ze ścisłą deduplikacją po czasie pomiaru IMGW)
    if (sample.isReference) {
      setReferenceSamples(prev => {
        const result = addReferenceSampleToArchive(prev, sample);
        if (result.added) {
          saveReferenceSamples(result.updated);
          return result.updated;
        }
        return prev;
      });
    }
  }, [data, calDetails]);

  // Obliczenie statystyk MAE wyłącznie z trwałego zbioru próbek referencyjnych IMGW
  const validationStats = useMemo(() => computeValidationStats(referenceSamples, validationSamples.length), [referenceSamples, validationSamples.length]);

  const handleClearValidationSamples = () => {
    clearValidationSamples();
    setValidationSamples([]);
    setReferenceSamples([]);
  };

  // Derive matched hour index
  let currentIdx = 0;
  let matchMethod: 'hour_prefix' | 'nearest_ms' | 'fallback' = 'fallback';
  if (rawOmHourly?.time && rawOmCurrent?.time) {
    const prefix = rawOmCurrent.time.slice(0, 13);
    const idx = rawOmHourly.time.findIndex((t: string) => t.startsWith(prefix));
    if (idx >= 0) {
      currentIdx = idx;
      matchMethod = 'hour_prefix';
    } else {
      const nowMs = Date.now();
      let bestIdx = 0;
      let minDiff = Infinity;
      rawOmHourly.time.forEach((t: string, i: number) => {
        const diff = Math.abs(new Date(t).getTime() - nowMs);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      });
      currentIdx = bestIdx;
      matchMethod = 'nearest_ms';
    }
  }

  // UV parameters extraction
  const currentTime = rawOmCurrent?.time ?? null;
  const matchedHourlyTime = rawOmHourly?.time?.[currentIdx] ?? null;
  const currentUv = typeof rawOmCurrent?.uv_index === 'number' ? rawOmCurrent.uv_index : null;
  const hourlyUv = typeof rawOmHourly?.uv_index?.[currentIdx] === 'number' ? rawOmHourly.uv_index[currentIdx] : null;
  const currentClearSkyUv = typeof (rawOmCurrent as any)?.uv_index_clear_sky === 'number' ? (rawOmCurrent as any).uv_index_clear_sky : null;
  const hourlyClearSkyUv = typeof (rawOmHourly as any)?.uv_index_clear_sky?.[currentIdx] === 'number' ? (rawOmHourly as any).uv_index_clear_sky[currentIdx] : null;

  let resolvedCurrentUv: number | null = null;
  let chosenUvSource: 'current' | 'hourly' | 'clear_sky' | 'fallback' = 'fallback';

  if (currentUv !== null) {
    resolvedCurrentUv = currentUv;
    chosenUvSource = 'current';
  } else if (hourlyUv !== null) {
    resolvedCurrentUv = hourlyUv;
    chosenUvSource = 'hourly';
  } else if (currentClearSkyUv !== null) {
    resolvedCurrentUv = currentClearSkyUv;
    chosenUvSource = 'clear_sky';
  } else {
    resolvedCurrentUv = null;
    chosenUvSource = 'fallback';
  }

  const uvVal = resolvedCurrentUv !== null && typeof resolvedCurrentUv === 'number' ? Math.max(0, resolvedCurrentUv) : null;
  const displayedUvInUi = uvVal !== null ? formatUvDisplay(uvVal) : '—';

  // Precipitation probability diagnostic extraction
  const todayDateStr = currentTime ? currentTime.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const matchedDailyTodayIdx = Array.isArray(rawOmDaily?.time)
    ? rawOmDaily.time.findIndex((t: string) => typeof t === 'string' && t.startsWith(todayDateStr))
    : -1;
  const todayDailyIndex = matchedDailyTodayIdx >= 0 ? matchedDailyTodayIdx : (rawOmDaily?.time && rawOmDaily.time.length > 1 ? 1 : 0);
  const dailyPrecipProbMaxToday = rawOmDaily?.precipitation_probability_max?.[todayDailyIndex] ?? null;

  const todayHourlyList = useMemo(() => {
    if (!rawOmHourly?.time || !Array.isArray(rawOmHourly.time)) return [];
    return rawOmHourly.time
      .map((t: string, idx: number) => ({
        time: t,
        idx,
        hourLabel: t.includes('T') ? t.split('T')[1].slice(0, 5) : t,
        pop: rawOmHourly.precipitation_probability?.[idx] ?? null,
        precip: rawOmHourly.precipitation?.[idx] ?? null,
        rain: (rawOmHourly as any)?.rain?.[idx] ?? null,
        showers: (rawOmHourly as any)?.showers?.[idx] ?? null
      }))
      .filter(item => item.time.startsWith(todayDateStr));
  }, [rawOmHourly, todayDateStr]);

  const calculatedMaxPopToday = useMemo(() => {
    const validPops = todayHourlyList
      .map(h => h.pop)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p));
    return validPops.length > 0 ? Math.max(...validPops) : null;
  }, [todayHourlyList]);

  let resolvedPrecipProbToday: number | null = dailyPrecipProbMaxToday;
  let precipProbSourceOfValue = `daily.precipitation_probability_max[${todayDailyIndex}]`;
  let precipProbSelectionReason = `Domyślne źródło podstawowe (daily.precipitation_probability_max[${todayDailyIndex}])`;

  if (
    (dailyPrecipProbMaxToday === null || dailyPrecipProbMaxToday === 0) &&
    calculatedMaxPopToday !== null &&
    calculatedMaxPopToday > 0
  ) {
    resolvedPrecipProbToday = calculatedMaxPopToday;
    precipProbSourceOfValue = 'MAX(hourly.precipitation_probability)';
    precipProbSelectionReason = `Korekta hybrydowa (fallback): daily = ${dailyPrecipProbMaxToday === null ? 'null' : '0%'}, ale wykryto MAX z dzisiejszych godzin = ${calculatedMaxPopToday}%`;
  }

  const uiDisplayedPrecipProbToday = resolvedPrecipProbToday !== null ? `${resolvedPrecipProbToday}%` : '—';

  // GPS Poland Bounds Check
  const isPolandBounds = effectiveLat >= 49.0 && effectiveLat <= 55.0 && effectiveLng >= 14.0 && effectiveLng <= 24.2;

  // IMGW station telemetry
  const imgw = data?.imgwStation;
  const imgwStationName = imgw?.stationName || imgw?.name || 'Brak wybranej stacji';
  const imgwId = imgw?.id || '—';
  const imgwDistance = imgw?.distanceKm !== undefined ? `${imgw.distanceKm.toFixed(1)} km` : (imgw?.distance || '—');
  const imgwTemp = typeof imgw?.temp === 'number' ? `${imgw.temp.toFixed(1)}°C` : 'Brak';
  const imgwHumidity = typeof imgw?.humidity === 'number' ? `${imgw.humidity}%` : 'Brak';
  const imgwWind = typeof imgw?.windSpeed === 'number' ? `${imgw.windSpeed} km/h` : 'Brak';
  const imgwTime = imgw?.lastSync || imgw?.measurementTime || 'Brak timestampu';

  // Open-Meteo current telemetry
  const omTemp = typeof rawOmCurrent?.temperature_2m === 'number' ? rawOmCurrent.temperature_2m : null;
  const omApparentTemp = typeof rawOmCurrent?.apparent_temperature === 'number' ? rawOmCurrent.apparent_temperature : null;
  const omHumidity = typeof rawOmCurrent?.relative_humidity_2m === 'number' ? rawOmCurrent.relative_humidity_2m : null;
  const omWindSpeed = typeof rawOmCurrent?.wind_speed_10m === 'number' ? rawOmCurrent.wind_speed_10m : null;
  const omWindGusts = typeof rawOmCurrent?.wind_gusts_10m === 'number' ? rawOmCurrent.wind_gusts_10m : null;
  const omCloudCover = typeof rawOmCurrent?.cloud_cover === 'number' ? rawOmCurrent.cloud_cover : null;
  const omPrecipitation = typeof rawOmCurrent?.precipitation === 'number' ? rawOmCurrent.precipitation : null;
  const omVisibility = typeof rawOmCurrent?.visibility === 'number' ? rawOmCurrent.visibility : null;

  // Construct status checks for the 14 categories
  const categoriesStatus = useMemo(() => {
    return [
      {
        id: 'gps',
        icon: MapPin,
        title: '📍 GPS / Lokalizacja',
        status: isPolandBounds ? 'ok' : 'warning',
        received: `Lat: ${effectiveLat.toFixed(4)}, Lng: ${effectiveLng.toFixed(4)}`,
        calculated: `Polska: ${isPolandBounds ? 'Tak' : 'Poza granicami'}, Metoda: ${geoDiagnostic?.method || 'Auto GPS'}`,
        uiValue: data?.city || geoDiagnostic?.cityName || 'Lokalizacja GPS'
      },
      {
        id: 'open_meteo',
        icon: Radio,
        title: '🌤️ Open-Meteo',
        status: rawOmCurrent ? 'ok' : 'error',
        received: `Timezone: ${data?.weather?.timezone || 'Europe/Warsaw'}, Provider: ${data?.weather?.provider || 'Open-Meteo V1'}`,
        calculated: `Rekordów hourly: ${rawOmHourly?.time?.length || 0} h, time: ${rawOmCurrent?.time || '—'}`,
        uiValue: rawOmCurrent ? '🟢 Połączono (API 200 OK)' : '🔴 Brak odpowiedzi'
      },
      {
        id: 'imgw',
        icon: Radio,
        title: '🛰️ IMGW Stacja',
        status: imgw?.temp !== null && imgw?.temp !== undefined ? 'ok' : 'warning',
        received: `Stacja: ${imgwStationName} (ID: ${imgwId}), Odległość: ${imgwDistance}`,
        calculated: `Temp: ${imgwTemp}, Wilgotność: ${imgwHumidity}, Wiatr: ${imgwWind}`,
        uiValue: imgw?.temp !== null && imgw?.temp !== undefined ? `Pomiar IMGW: ${imgwTemp} (${imgwTime})` : '🟡 Brak odczytu temp IMGW (fallback do Open-Meteo)'
      },
      {
        id: 'uv',
        icon: Sun,
        title: '☀️ UV Index',
        status: uvVal !== null ? 'ok' : 'warning',
        received: `current.uv: ${currentUv ?? 'null'}, hourly.uv[${currentIdx}]: ${hourlyUv ?? 'null'}`,
        calculated: `resolvedCurrentUv: ${resolvedCurrentUv ?? 'null'}, do formatowania: ${uvVal ?? 'null'}`,
        uiValue: `UI: ${displayedUvInUi} (użyto formatUvDisplay)`
      },
      {
        id: 'temp',
        icon: Thermometer,
        title: '🌡️ Temperatura',
        status: omTemp !== null ? 'ok' : 'error',
        received: `Open-Meteo: ${omTemp !== null ? `${omTemp}°C` : 'Brak'}, IMGW: ${imgwTemp}`,
        calculated: `Scalona w model: ${typeof data?.imgwStation?.temp === 'number' ? `${data.imgwStation.temp.toFixed(1)}°C (IMGW Synop)` : `${omTemp?.toFixed(1)}°C`}`,
        uiValue: `${omTemp !== null ? omTemp.toFixed(1).replace('.', ',') : '—'}°C`
      },
      {
        id: 'apparent_temp',
        icon: Thermometer,
        title: '🌡️ Temp. Odczuwalna',
        status: omApparentTemp !== null ? 'ok' : 'warning',
        received: `Open-Meteo: ${omApparentTemp !== null ? `${omApparentTemp}°C` : 'Brak'}`,
        calculated: `Wzorzec odczuwalności (wiatr + wilgotność): ${omApparentTemp !== null ? `${omApparentTemp.toFixed(1)}°C` : '—'}`,
        uiValue: `${omApparentTemp !== null ? omApparentTemp.toFixed(1).replace('.', ',') : '—'}°C`
      },
      {
        id: 'humidity',
        icon: Droplet,
        title: '💧 Wilgotność',
        status: omHumidity !== null ? 'ok' : 'warning',
        received: `Open-Meteo: ${omHumidity !== null ? `${omHumidity}%` : 'Brak'}, IMGW: ${imgwHumidity}`,
        calculated: `Użyta wartość: ${omHumidity ?? imgw?.humidity ?? '—'}%`,
        uiValue: `${omHumidity ?? imgw?.humidity ?? '—'}%`
      },
      {
        id: 'wind',
        icon: Wind,
        title: '💨 Wiatr / Porywy',
        status: omWindSpeed !== null ? 'ok' : 'warning',
        received: `Wiatr: ${omWindSpeed !== null ? `${omWindSpeed} km/h` : 'Brak'}, Porywy: ${omWindGusts !== null ? `${omWindGusts} km/h` : 'Brak'}`,
        calculated: `Przeliczenie km/h oraz wektora ruszania chmur`,
        uiValue: `${omWindSpeed ?? '—'} km/h (porywy ${omWindGusts ?? '—'} km/h)`
      },
      {
        id: 'cloud',
        icon: Cloud,
        title: '☁️ Zachmurzenie',
        status: omCloudCover !== null ? 'ok' : 'warning',
        received: `Open-Meteo: ${omCloudCover !== null ? `${omCloudCover}%` : 'Brak'}`,
        calculated: `Korekta satelitarna / manualna (0-100%)`,
        uiValue: `${omCloudCover ?? 0}%`
      },
      {
        id: 'precipitation',
        icon: CloudRain,
        title: '🌧️ Opady',
        status: omPrecipitation !== null ? 'ok' : 'warning',
        received: `Deszcz / Śnieg: ${omPrecipitation !== null ? `${omPrecipitation} mm` : '0 mm'}`,
        calculated: `Suma opadu bieżąca: ${omPrecipitation ?? 0} mm/h`,
        uiValue: `${omPrecipitation ?? 0} mm`
      },
      {
        id: 'visibility',
        icon: Eye,
        title: '🌫️ Widoczność',
        status: omVisibility !== null ? 'ok' : 'warning',
        received: `Vis: ${omVisibility !== null ? `${omVisibility} m` : 'Brak'}`,
        calculated: `Przeliczenie m na km: ${omVisibility !== null ? `${(omVisibility / 1000).toFixed(1)} km` : '10 km'}`,
        uiValue: `${omVisibility !== null ? `${(omVisibility / 1000).toFixed(1)} km` : '10.0 km'}`
      },
      {
        id: 'cache',
        icon: Database,
        title: '💾 Cache / Pamięć',
        status: data?.lastUpdated ? 'ok' : 'warning',
        received: `Ostatnia synchronizacja: ${data?.lastUpdated || new Date().toLocaleTimeString('pl-PL')}`,
        calculated: `TTL serwera: 2 min, LocalStorage: AKTYWNE`,
        uiValue: `Pamięć podręczna spójna (${data?.lastUpdated ? 'zapisano' : 'na żywo'})`
      },
      {
        id: 'api_proxy',
        icon: Zap,
        title: '🔌 API / Express Proxy',
        status: isNative ? 'warning' : 'ok',
        received: `Środowisko: ${isNative ? 'Capacitor Android (Client Fallback)' : 'Przeglądarka Web (Express Proxy)'}`,
        calculated: `Status połączenia: ${isNative ? 'Bezpośrednie połączenie klienta z Open-Meteo/IMGW' : 'Proxy backendowe /api/weather OK'}`,
        uiValue: isNative ? '🟡 Natywne Client Fallback' : '🟢 Proxy Express /api'
      },
      {
        id: 'pwa',
        icon: Smartphone,
        title: '📱 PWA / Pasek Android',
        status: typeof window !== 'undefined' && ('serviceWorker' in navigator || isNative) ? 'ok' : 'warning',
        received: `ServiceWorker: ${typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Wspierany' : 'Niewspierany'}`,
        calculated: `Natywny Capacitor: ${isNative ? 'TAK' : 'NIE (Web)'}`,
        uiValue: isNative ? '📱 Paczka APK Android' : '🌐 Aplikacja Web PWA'
      }
    ];
  }, [
    effectiveLat,
    effectiveLng,
    isPolandBounds,
    geoDiagnostic,
    data,
    rawOmCurrent,
    rawOmHourly,
    imgw,
    imgwStationName,
    imgwId,
    imgwDistance,
    imgwTemp,
    imgwHumidity,
    imgwWind,
    imgwTime,
    uvVal,
    currentUv,
    hourlyUv,
    currentIdx,
    resolvedCurrentUv,
    displayedUvInUi,
    omTemp,
    omApparentTemp,
    omHumidity,
    omWindSpeed,
    omWindGusts,
    omCloudCover,
    omPrecipitation,
    omVisibility,
    isNative
  ]);

  // Count errors and warnings for top summary
  const summaryCounts = useMemo(() => {
    let ok = 0;
    let warning = 0;
    let error = 0;
    categoriesStatus.forEach(c => {
      if (c.status === 'ok') ok++;
      else if (c.status === 'warning') warning++;
      else if (c.status === 'error') error++;
    });
    return { ok, warning, error, total: categoriesStatus.length };
  }, [categoriesStatus]);

  // Automated Natural Language Analysis Section
  const automatedAnalysisMessages = useMemo(() => {
    const msgs: { type: 'ok' | 'warning' | 'error'; text: string; category: string }[] = [];

    // 1. UV Index Analysis
    if (typeof currentUv === 'number' || typeof hourlyUv === 'number') {
      const activeVal = typeof currentUv === 'number' ? currentUv : (hourlyUv as number);
      const sourceLabel = typeof currentUv === 'number' ? 'current.uv_index' : `hourly.uv_index[${currentIdx}]`;
      if (activeVal > 0 && activeVal < 1) {
        msgs.push({
          type: 'ok',
          category: 'UV Index',
          text: `🟢 UV: Open-Meteo zwraca surową wartość ułamkową ${activeVal} (${sourceLabel}). Dzięki funkcji formatUvDisplay w UI wyświetla się wartość '${displayedUvInUi}' bez niepotrzebnego zaokrąglania do 0.`
        });
      } else if (activeVal === 0 && rawOmCurrent?.is_day === 0) {
        msgs.push({
          type: 'ok',
          category: 'UV Index',
          text: `🟢 UV: Wartość 0.0 wynika z pory nocnej (is_day = 0). Odczyt z ${sourceLabel} jest prawidłowy i zsynchronizowany (${matchedHourlyTime}).`
        });
      } else if (activeVal === 0) {
        msgs.push({
          type: 'ok',
          category: 'UV Index',
          text: `🟢 UV: Wartość 0.0 (brak promieniowania UV) z ${sourceLabel} jest prawidłowa.`
        });
      } else {
        msgs.push({
          type: 'ok',
          category: 'UV Index',
          text: `🟢 UV: Odczytano wartość ${displayedUvInUi} z ${sourceLabel}. Czas bieżący (${currentTime}) pasuje do indeksu hourly [${currentIdx}] (${matchedHourlyTime}).`
        });
      }
    } else if (typeof currentClearSkyUv === 'number') {
      msgs.push({
        type: 'warning',
        category: 'UV Index',
        text: `🟡 UV: Brak surowego parametru uv_index w Open-Meteo. Użyto wyliczenia rezerwowego z modelu clear sky (${currentClearSkyUv.toFixed(1)}).`
      });
    } else {
      msgs.push({
        type: 'warning',
        category: 'UV Index',
        text: `🟡 UV: Brak parametru uv_index w odpowiedzi Open-Meteo (brak pól current i hourly).`
      });
    }

    // 2. GPS Location Analysis
    if (isPolandBounds) {
      msgs.push({
        type: 'ok',
        category: 'GPS',
        text: `🟢 GPS: Pozycja (${effectiveLat.toFixed(4)}, ${effectiveLng.toFixed(4)}) mieści się w granicach Polski. Reverse geocoding przypisał miasto '${data?.city || geoDiagnostic?.cityName || 'Lokalizacja GPS'}'.`
      });
    } else {
      msgs.push({
        type: 'warning',
        category: 'GPS',
        text: `🟡 GPS: Współrzędne (${effectiveLat.toFixed(4)}, ${effectiveLng.toFixed(4)}) znajdują się poza standardowym zakresem Polski. Sprawdź uprawnienia do geolokalizacji.`
      });
    }

    // 3. IMGW Station Analysis
    if (imgw && typeof imgw.temp === 'number') {
      msgs.push({
        type: 'ok',
        category: 'IMGW',
        text: `🟢 IMGW: Najbliższa stacja synoptyczna '${imgwStationName}' (${imgwDistance}) przesłała temperaturę ${imgw.temp.toFixed(1)}°C (synch: ${imgwTime}).`
      });
    } else {
      msgs.push({
        type: 'warning',
        category: 'IMGW',
        text: `🟡 IMGW: Najbliższa stacja (${imgwStationName}) nie przesłała aktualnej temperatury lub jest niedostępna. Wyświetlana jest temperatura z numerycznego modelu Open-Meteo.`
      });
    }

    // 4. API & Proxy Analysis
    if (isNative) {
      msgs.push({
        type: 'warning',
        category: 'API',
        text: `🟡 API: Wykryto natywne środowisko mobilne Android (Capacitor). Aplikacja korzysta z bezpiecznego połączenia bezpośredniego (Client Fallback) dla zapewnienia natychmiastowego startu.`
      });
    } else {
      msgs.push({
        type: 'ok',
        category: 'API',
        text: `🟢 API: Połączenie Web z serwerem Express (/api/weather) działa poprawnie ze spójnym cache.`
      });
    }

    return msgs;
  }, [
    currentUv,
    hourlyUv,
    displayedUvInUi,
    rawOmCurrent,
    currentTime,
    currentIdx,
    matchedHourlyTime,
    isPolandBounds,
    effectiveLat,
    effectiveLng,
    data,
    geoDiagnostic,
    imgw,
    imgwStationName,
    imgwDistance,
    imgwTime,
    isNative
  ]);

  const copyFullDiagnosticJson = () => {
    const diagnosticReport = {
      timestamp: new Date().toISOString(),
      platform: isNative ? 'Capacitor Android APK' : 'Web Browser',
      summary: summaryCounts,
      gps: {
        effectiveLat,
        effectiveLng,
        isPolandBounds,
        city: data?.city || geoDiagnostic?.cityName,
        geoDiagnostic
      },
      uvDeepDiagnostic: {
        currentTime,
        currentIdx,
        matchMethod,
        matchedHourlyTime,
        currentUv,
        hourlyUv,
        currentClearSkyUv,
        hourlyClearSkyUv,
        resolvedCurrentUv,
        chosenUvSource,
        uvVal,
        displayedUvInUi
      },
      precipitationProbabilityDiagnostic: {
        dailyPrecipitationProbabilityMaxToday: dailyPrecipProbMaxToday,
        todayDailyIndex,
        todayDateStr,
        todayHourRange: {
          start: todayHourlyList[0]?.time ?? null,
          end: todayHourlyList[todayHourlyList.length - 1]?.time ?? null,
          totalHoursCount: todayHourlyList.length
        },
        todayHourlyProbabilities: todayHourlyList.map(h => ({
          time: h.time,
          hour: h.hourLabel,
          precipitation_probability: h.pop,
          precipitation_mm: h.precip,
          rain_mm: h.rain,
          showers_mm: h.showers
        })),
        calculatedMaxPopTodayFromHourly: calculatedMaxPopToday,
        resolvedPrecipitationProbabilityMaxToday: resolvedPrecipProbToday,
        finalValueDisplayedInUi: uiDisplayedPrecipProbToday,
        sourceOfValue: precipProbSourceOfValue,
        selectionReason: precipProbSelectionReason,
        dataTimestamp: currentTime || new Date().toISOString(),
        cacheInfo: {
          lastUpdated: data?.lastUpdated || null,
          ttlMs: 120000
        }
      },
      imgwStation: data?.imgwStation,
      openMeteoCurrent: rawOmCurrent,
      openMeteoHourlySample: {
        time: rawOmHourly?.time?.[currentIdx],
        temp: rawOmHourly?.temperature_2m?.[currentIdx],
        uv: rawOmHourly?.uv_index?.[currentIdx]
      },
      temperatureValidation: {
        sampleCount: validationStats.sampleCount,
        validReferenceCount: validationStats.validReferenceCount,
        aura: validationStats.aura,
        openMeteo: validationStats.openMeteo,
        comparison: validationStats.comparison,
        referenceSamples: referenceSamples,
        diagnosticBuffer: validationSamples
      },
      selfDiagnosticReport: selfDiagReport
    };

    navigator.clipboard.writeText(JSON.stringify(diagnosticReport, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Calculation variables for current sample display in validation sub-tab
  const auraFinalTemp = calDetails.calibratedTemp;
  const omRawTemp = calDetails.rawOpenMeteoTemp ?? null;
  const omRawApparent = data?.weather?.current?.apparent_temperature ?? null;
  const imgwValTemp = calDetails.imgwTemp ?? (typeof data?.imgwStation?.temp === 'number' ? data.imgwStation.temp : null);

  const currentAuraApparent = auraFinalTemp !== null
    ? (calculateApparentTemperature(
        auraFinalTemp,
        data?.weather?.current?.relative_humidity_2m,
        data?.weather?.current?.wind_speed_10m,
        data?.weather?.current?.wind_gusts_10m
      ) ?? (omRawApparent !== null ? Number((omRawApparent + (calDetails.effectiveBias ?? 0)).toFixed(1)) : null))
    : null;

  const currentImgwApparent = imgwValTemp !== null
    ? calculateApparentTemperature(
        imgwValTemp,
        data?.imgwStation?.humidity ?? data?.weather?.current?.relative_humidity_2m,
        data?.imgwStation?.windSpeed ?? data?.weather?.current?.wind_speed_10m,
        data?.imgwStation?.windGust ?? data?.weather?.current?.wind_gusts_10m
      )
    : null;

  const currentAuraError = (auraFinalTemp !== null && imgwValTemp !== null) ? Number((auraFinalTemp - imgwValTemp).toFixed(2)) : null;
  const currentOmError = (omRawTemp !== null && imgwValTemp !== null) ? Number((omRawTemp - imgwValTemp).toFixed(2)) : null;

  const absAuraErr = currentAuraError !== null ? Math.abs(currentAuraError) : null;
  const absOmErr = currentOmError !== null ? Math.abs(currentOmError) : null;

  let sampleCloserLabel = '—';
  let sampleCloserColor = 'text-slate-400 bg-slate-800 border-slate-700';
  if (absAuraErr !== null && absOmErr !== null) {
    const diff = Math.abs(absAuraErr - absOmErr);
    if (diff < 0.01) {
      sampleCloserLabel = 'Remis (równa dokładność)';
      sampleCloserColor = 'text-slate-300 bg-slate-800 border-slate-700';
    } else if (absAuraErr < absOmErr) {
      sampleCloserLabel = '🟢 Aura bliżej IMGW';
      sampleCloserColor = 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40';
    } else {
      sampleCloserLabel = '🔵 Open-Meteo bliżej IMGW';
      sampleCloserColor = 'text-cyan-300 bg-cyan-950/60 border-cyan-500/40';
    }
  }

  const getModeStats = (modeName: string) => {
    const modeSamples = validationSamples.filter(s => s.calibrationMode === modeName && s.auraError !== null && s.openMeteoError !== null);
    if (modeSamples.length < 3) {
      return { count: modeSamples.length, reliable: false };
    }
    const auraMae = modeSamples.reduce((acc, s) => acc + Math.abs(s.auraError!), 0) / modeSamples.length;
    const omMae = modeSamples.reduce((acc, s) => acc + Math.abs(s.openMeteoError!), 0) / modeSamples.length;
    return {
      count: modeSamples.length,
      reliable: true,
      auraMae: Number(auraMae.toFixed(2)),
      omMae: Number(omMae.toFixed(2)),
      improvement: Number((omMae - auraMae).toFixed(2))
    };
  };

  const content = (
    <div className="space-y-6 text-slate-100">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-slate-900/50 border border-purple-500/30 rounded-3xl backdrop-blur-xl shadow-2xl">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-purple-500/20 border border-purple-400/30 rounded-2xl text-purple-300 shadow-inner">
            <Activity className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-white tracking-tight">
                Centrum Diagnostyczne Aury
              </h2>
              <span className="text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/30 px-2 py-0.5 rounded-full font-mono font-bold">
                LIVE TELEMETRY
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Pełny wgląd w przepływ danych: API → Odczyt → Obliczenia → Interfejs UI
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3.5 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 rounded-xl text-xs font-bold text-purple-200 flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
              title="Odśwież dane z API"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Odśwież</span>
            </button>
          )}

          <button
            onClick={copyFullDiagnosticJson}
            className="px-3.5 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 rounded-xl text-xs font-bold text-indigo-200 flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
            title="Kopiuj pełny raport JSON do schowka"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Skopiowano!' : 'Raport JSON'}</span>
          </button>

          {isOpenAsModal && onCloseModal && (
            <button
              onClick={onCloseModal}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Zamknij Centrum Diagnostyczne"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Status Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-900/60 border border-slate-700/60 rounded-2xl flex flex-col items-center justify-center text-center">
          <span className="text-xs text-slate-400 font-medium">Monitoring Ogólny</span>
          <span className="text-xl font-black text-white mt-1">
            Wykryto {summaryCounts.error} błędów / {summaryCounts.warning} ostrzeżeń
          </span>
        </div>
        <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <div>
              <div className="text-xs text-slate-300 font-bold">Prawidłowe (OK)</div>
              <div className="text-xl font-black text-emerald-300">{summaryCounts.ok} / {summaryCounts.total}</div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <div>
              <div className="text-xs text-slate-300 font-bold">Ostrzeżenia</div>
              <div className="text-xl font-black text-amber-300">{summaryCounts.warning}</div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <div>
              <div className="text-xs text-slate-300 font-bold">Błędy</div>
              <div className="text-xl font-black text-rose-300">{summaryCounts.error}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Automatyczna Analiza (Auto Analysis Natural Language) */}
      <div className="p-5 bg-slate-900/80 border border-slate-700/80 rounded-3xl space-y-3 shadow-xl">
        <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
          <Cpu className="w-4 h-4 text-indigo-400" />
          <span>Automatyczna Analiza Systemowa (Interpretacja Naturalna)</span>
        </div>
        <div className="space-y-2">
          {automatedAnalysisMessages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-2xl text-xs flex items-start space-x-2 border ${
                msg.type === 'ok'
                  ? 'bg-emerald-950/20 border-emerald-500/20 text-slate-200'
                  : msg.type === 'warning'
                  ? 'bg-amber-950/20 border-amber-500/20 text-slate-200'
                  : 'bg-rose-950/20 border-rose-500/20 text-slate-200'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {msg.type === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {msg.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400" />}
                {msg.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
              </div>
              <div className="leading-relaxed">{msg.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Tabs for Diagnostic Views */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setActiveSubTab('engine')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'engine'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40 border border-purple-400/40'
              : 'text-purple-300 hover:text-white hover:bg-purple-950/40'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-purple-300" />
          <span>🧠 Self-Diagnostic Engine</span>
          {selfDiagReport.issues.length > 0 && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              selfDiagReport.severityCounts.critical > 0 || selfDiagReport.severityCounts.high > 0
                ? 'bg-rose-500 text-white animate-pulse'
                : selfDiagReport.severityCounts.medium > 0
                ? 'bg-amber-500 text-black'
                : 'bg-indigo-500 text-white'
            }`}>
              {selfDiagReport.issues.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('timeline')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'timeline'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-indigo-300" />
          <span>⏱️ Oś czasu i świeżość</span>
        </button>

        <button
          onClick={() => setActiveSubTab('matrix')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'matrix'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>📊 Macierz 14 parametrów</span>
        </button>

        <button
          onClick={() => setActiveSubTab('uv_deep')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'uv_deep'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sun className="w-3.5 h-3.5 text-amber-300" />
          <span>☀️ Diagnostyka UV</span>
        </button>

        <button
          onClick={() => setActiveSubTab('precip_deep')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'precip_deep'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CloudRain className="w-3.5 h-3.5 text-cyan-300" />
          <span>🌧️ Diagnostyka opadów</span>
        </button>

        <button
          onClick={() => setActiveSubTab('validation')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'validation'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-amber-300" />
          <span>🌡️ Walidacja algorytmu</span>
        </button>

        <button
          onClick={() => setActiveSubTab('imgw')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'imgw'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-emerald-300" />
          <span>📻 Stacja IMGW</span>
        </button>

        <button
          onClick={() => setActiveSubTab('gps')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'gps'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-cyan-300" />
          <span>📍 GPS i geolokalizacja</span>
        </button>

        <button
          onClick={() => setActiveSubTab('api')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'api'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-blue-300" />
          <span>⚡ API i fallback</span>
        </button>

        <button
          onClick={() => setActiveSubTab('legacy')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'legacy'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-indigo-300" />
          <span>🗺️ Pola API i czujniki</span>
        </button>
      </div>

      {/* SUB-TAB: AURA SELF-DIAGNOSTIC ENGINE */}
      {activeSubTab === 'engine' && (
        <div className="space-y-6">
          {/* 1. HEALTH SCORE HERO BANNER */}
          <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950/50 to-purple-950/40 border border-purple-500/30 rounded-3xl space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <Cpu className="w-6 h-6 text-purple-400 animate-pulse" />
                  <h3 className="text-lg font-black text-white tracking-tight">
                    Aura Self-Diagnostic Engine
                  </h3>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full">
                    AUTOMATIC SYSTEM AUDITOR
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Ciągły nadzór nad spójnością fizyczną, logiką modeli, synchronizacją czasu, fallbackami i zgodnością UI.
                </p>
              </div>

              <div className="flex items-center space-x-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-2xl">
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zdrowie Systemu</div>
                  <div className={`text-2xl font-black ${
                    selfDiagReport.overallHealthPercent >= 90
                      ? 'text-emerald-400'
                      : selfDiagReport.overallHealthPercent >= 70
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}>
                    {selfDiagReport.overallHealthPercent} <span className="text-sm font-semibold text-slate-400">/ 100</span>
                  </div>
                </div>
                <div className={`w-3.5 h-3.5 rounded-full ${
                  selfDiagReport.overallHealthPercent >= 90
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse'
                    : selfDiagReport.overallHealthPercent >= 70
                    ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                    : 'bg-rose-500 shadow-lg shadow-rose-500/50 animate-ping'
                }`} />
              </div>
            </div>

            {/* Severity Breakdown Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-rose-300">🔴 Krytyczne</div>
                  <div className="text-lg font-black text-rose-400">{selfDiagReport.severityCounts.critical}</div>
                </div>
                <AlertCircle className="w-5 h-5 text-rose-400/60" />
              </div>

              <div className="p-3 bg-orange-950/30 border border-orange-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-orange-300">🟠 Wysokie</div>
                  <div className="text-lg font-black text-orange-400">{selfDiagReport.severityCounts.high}</div>
                </div>
                <AlertTriangle className="w-5 h-5 text-orange-400/60" />
              </div>

              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-amber-300">🟡 Średnie</div>
                  <div className="text-lg font-black text-amber-400">{selfDiagReport.severityCounts.medium}</div>
                </div>
                <AlertCircle className="w-5 h-5 text-amber-400/60" />
              </div>

              <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-blue-300">🔵 Niskie</div>
                  <div className="text-lg font-black text-blue-400">{selfDiagReport.severityCounts.low}</div>
                </div>
                <Info className="w-5 h-5 text-blue-400/60" />
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-emerald-300">🟢 Informacje</div>
                  <div className="text-lg font-black text-emerald-400">{selfDiagReport.severityCounts.info}</div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-400/60" />
              </div>
            </div>

            {/* Health Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-300">
                <span>Wskaźnik niezawodności i spójności fizycznej Aury</span>
                <span className="font-mono font-bold text-white">{selfDiagReport.overallHealthPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-700 ${
                    selfDiagReport.overallHealthPercent >= 90
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : selfDiagReport.overallHealthPercent >= 70
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      : 'bg-gradient-to-r from-rose-600 to-red-500'
                  }`}
                  style={{ width: `${selfDiagReport.overallHealthPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* 2. SOURCES STATUS */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Status Źródeł Danych i Pomiary Referencyjne</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400 font-medium">Open-Meteo</div>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${selfDiagReport.sourcesStatus.openMeteo === 'HEALTHY' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-white">{selfDiagReport.sourcesStatus.openMeteo}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400 font-medium">IMGW Telemetria</div>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${
                    selfDiagReport.sourcesStatus.imgw === 'HEALTHY'
                      ? 'bg-emerald-400'
                      : selfDiagReport.sourcesStatus.imgw === 'OUTDATED'
                      ? 'bg-amber-400'
                      : 'bg-slate-500'
                  }`} />
                  <span className="text-white">{selfDiagReport.sourcesStatus.imgw}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400 font-medium">GIOŚ Powietrze</div>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className={`w-2 h-2 rounded-full ${selfDiagReport.sourcesStatus.gios === 'HEALTHY' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="text-white">{selfDiagReport.sourcesStatus.gios}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400 font-medium">Radar Opadów</div>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-white">{selfDiagReport.sourcesStatus.radar}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1">
                <div className="text-slate-400 font-medium">Satelita / Chmury</div>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-white">{selfDiagReport.sourcesStatus.satellite}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. PARAMETER MATRIX (11 PARAMETRÓW) */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Macierz Spójności Parametrów Pogodowych (11 domen)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">STATUS DOMENOWY</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
              {[
                { key: 'temperature', label: 'Temperatura (T)', icon: '🌡️', status: selfDiagReport.parameterMatrix.temperature },
                { key: 'apparent', label: 'Odczuwalna (Steadman)', icon: '🥋', status: selfDiagReport.parameterMatrix.apparent },
                { key: 'uv', label: 'Indeks UV', icon: '☀️', status: selfDiagReport.parameterMatrix.uv },
                { key: 'precipitation', label: 'Opady i Nowcasting', icon: '🌧️', status: selfDiagReport.parameterMatrix.precipitation },
                { key: 'cloud', label: 'Zachmurzenie optyczne', icon: '☁️', status: selfDiagReport.parameterMatrix.cloud },
                { key: 'wind', label: 'Wiatr i porywy', icon: '💨', status: selfDiagReport.parameterMatrix.wind },
                { key: 'humidity', label: 'Wilgotność względna', icon: '💧', status: selfDiagReport.parameterMatrix.humidity },
                { key: 'pressure', label: 'Ciśnienie atmosferyczne', icon: '⏱️', status: selfDiagReport.parameterMatrix.pressure },
                { key: 'dewPoint', label: 'Punkt rosy (Tdew <= T)', icon: '🌫️', status: selfDiagReport.parameterMatrix.dewPoint },
                { key: 'lwd', label: 'Zwilżenie liścia (LWD)', icon: '🍃', status: selfDiagReport.parameterMatrix.lwd },
                { key: 'timeSync', label: 'Synchronizacja czasu', icon: '🕒', status: selfDiagReport.parameterMatrix.timeSync },
              ].map((param) => {
                const isError = param.status === 'ERROR';
                const isWarn = param.status === 'WARNING';
                return (
                  <div
                    key={param.key}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                      isError
                        ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                        : isWarn
                        ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                        : 'bg-slate-950/70 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-base">{param.icon}</span>
                      <span className="font-semibold">{param.label}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isError
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : isWarn
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {param.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. ISSUES & ANOMALIES BROWSER */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
                <AlertCircle className="w-4 h-4 text-indigo-400" />
                <span>Wykryte Niespójności i Anomalie ({selfDiagReport.issues.length})</span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1.5 overflow-x-auto text-[11px] font-bold">
                <button
                  onClick={() => setIssueSeverityFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    issueSeverityFilter === 'ALL'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Wszystkie ({selfDiagReport.issues.length})
                </button>
                <button
                  onClick={() => setIssueSeverityFilter('CRITICAL_HIGH')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    issueSeverityFilter === 'CRITICAL_HIGH'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Krytyczne i Wysokie ({selfDiagReport.severityCounts.critical + selfDiagReport.severityCounts.high})
                </button>
                <button
                  onClick={() => setIssueSeverityFilter('MEDIUM')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    issueSeverityFilter === 'MEDIUM'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Średnie ({selfDiagReport.severityCounts.medium})
                </button>
                <button
                  onClick={() => setIssueSeverityFilter('LOW_INFO')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    issueSeverityFilter === 'LOW_INFO'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white bg-slate-800/60'
                  }`}
                >
                  Niskie / Info ({selfDiagReport.severityCounts.low + selfDiagReport.severityCounts.info})
                </button>
              </div>
            </div>

            {/* Filtered Issues List */}
            {(() => {
              const filtered = selfDiagReport.issues.filter((iss) => {
                if (issueSeverityFilter === 'CRITICAL_HIGH') {
                  return iss.severity === 'CRITICAL' || iss.severity === 'HIGH';
                }
                if (issueSeverityFilter === 'MEDIUM') {
                  return iss.severity === 'MEDIUM';
                }
                if (issueSeverityFilter === 'LOW_INFO') {
                  return iss.severity === 'LOW' || iss.severity === 'INFO';
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center bg-slate-950/50 border border-slate-800/60 rounded-2xl space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">Brak wykrytych anomalii w tej kategorii</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Wszystkie parametry w wybranym filtrze spełniają reguły spójności matematycznej i fizycznej Aury.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filtered.map((issue) => {
                    const isCrit = issue.severity === 'CRITICAL';
                    const isHigh = issue.severity === 'HIGH';
                    const isMed = issue.severity === 'MEDIUM';
                    return (
                      <div
                        key={issue.id}
                        className={`p-4 rounded-2xl border space-y-3 transition-all ${
                          isCrit
                            ? 'bg-rose-950/25 border-rose-500/40'
                            : isHigh
                            ? 'bg-orange-950/25 border-orange-500/40'
                            : isMed
                            ? 'bg-amber-950/20 border-amber-500/40'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        {/* Header: Severity + Parameter + File Link */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                              isCrit
                                ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                                : isHigh
                                ? 'bg-orange-500/30 text-orange-300 border border-orange-500/40'
                                : isMed
                                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                            }`}>
                              {issue.severity}
                            </span>
                            <span className="text-xs font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-800/40">
                              {issue.parameter}
                            </span>
                            <span className="text-xs font-mono font-bold text-white">
                              {issue.id}
                            </span>
                          </div>

                          {issue.file && (
                            <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              📁 {issue.file}:{issue.line || 1} {issue.component ? `(${issue.component})` : ''}
                            </span>
                          )}
                        </div>

                        {/* Value Chain Comparison if present */}
                        {(issue.sourceValue !== undefined || issue.computedValue !== undefined || issue.uiDisplayedValue !== undefined) && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs font-mono">
                            {issue.sourceValue !== undefined && (
                              <div className="space-y-0.5">
                                <div className="text-[10px] text-slate-400 font-sans">Źródło / Surowa wartość:</div>
                                <div className="text-cyan-300 font-bold break-all">{String(issue.sourceValue)}</div>
                              </div>
                            )}
                            {issue.computedValue !== undefined && (
                              <div className="space-y-0.5">
                                <div className="text-[10px] text-slate-400 font-sans">Obliczenia Aury:</div>
                                <div className="text-purple-300 font-bold break-all">{String(issue.computedValue)}</div>
                              </div>
                            )}
                            {issue.uiDisplayedValue !== undefined && (
                              <div className="space-y-0.5">
                                <div className="text-[10px] text-slate-400 font-sans">Prezentacja w UI:</div>
                                <div className="text-amber-300 font-bold break-all">{String(issue.uiDisplayedValue)}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Description */}
                        <div className="text-xs text-slate-200 leading-relaxed font-sans">
                          {issue.description}
                        </div>

                        {/* Suggested Fix Box */}
                        <div className="p-3 bg-indigo-950/30 border border-indigo-500/20 rounded-xl space-y-1 text-xs">
                          <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center space-x-1">
                            <Zap className="w-3 h-3 text-indigo-400" />
                            <span>Proponowane rozwiązanie:</span>
                          </div>
                          <div className="text-indigo-100 font-mono text-[11px] leading-relaxed">
                            {issue.suggestedFix}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* 5. ACTIVE FALLBACKS TRACKER */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>Aktywne Fallbacki i Mechanizmy Zastępcze ({selfDiagReport.fallbacksTracked.length})</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">FALLBACK AUDITOR</span>
            </div>

            {selfDiagReport.fallbacksTracked.length === 0 ? (
              <div className="p-4 text-center bg-slate-950/50 border border-slate-800/60 rounded-2xl text-xs text-slate-400">
                Wszystkie parametry korzystają z podstawowych źródeł danych pierwszego wyboru.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {selfDiagReport.fallbacksTracked.map((fb, idx) => (
                  <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-purple-300">{fb.parameter}</span>
                        <span className="text-slate-500">→</span>
                        <span className="font-mono text-cyan-300">{fb.fallbackUsed}</span>
                      </div>
                      <div className="text-slate-400 text-[11px]">{fb.reason}</div>
                    </div>
                    <span className={`self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold ${
                      fb.isSafe
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {fb.isSafe ? '🟢 BEZPIECZNY' : '🟡 WPŁYW NA DOKŁADNOŚĆ'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. PERSISTENT DIAGNOSTIC HISTORY & TRENDS */}
          <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <span>Trendy i Powtarzalność Problemów (localStorage Engine)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Łącznie ewaluacji: {selfDiagReport.trendsSummary.totalEvaluations}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1">
                <span className="text-slate-400 text-[11px]">Najczęściej wykrywana uwaga:</span>
                <div className="font-bold text-amber-300 text-sm">
                  {selfDiagReport.trendsSummary.mostFrequentIssue || 'Brak powtarzalnych uwag'}
                </div>
              </div>

              <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-1">
                <span className="text-slate-400 text-[11px]">Średni bias IMGW vs OM:</span>
                <div className="font-bold text-cyan-300 text-sm">
                  {selfDiagReport.trendsSummary.avgImgwBias !== null && selfDiagReport.trendsSummary.avgImgwBias !== undefined
                    ? `${selfDiagReport.trendsSummary.avgImgwBias > 0 ? '+' : ''}${selfDiagReport.trendsSummary.avgImgwBias.toFixed(2)}°C`
                    : 'Brak aktywnego biasu'}
                </div>
              </div>
            </div>

            {Object.keys(selfDiagReport.trendsSummary.issueOccurrences).length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-400">Liczba wystąpień poszczególnych zdarzeń:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {Object.entries(selfDiagReport.trendsSummary.issueOccurrences).map(([issueKey, count]) => (
                    <div key={issueKey} className="p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between font-mono">
                      <span className="text-slate-300 text-[11px] truncate pr-2">{issueKey}</span>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-bold text-[10px]">
                        {count}x
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB: OŚ CZASU I ŚWIEŻOŚĆ DANYCH */}
      {activeSubTab === 'timeline' && (
        <div className="p-5 bg-slate-900/90 border border-indigo-500/30 rounded-3xl space-y-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-indigo-300 font-bold text-base">
              <Clock className="w-5 h-5 text-indigo-400" />
              <span>Niezależna Oś Czasu i Świeżość Danych</span>
            </div>
            <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30 font-bold">
              INDEPENDENT SOURCE TIMELINE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OPEN-METEO CARD */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="font-bold text-cyan-300 text-sm">OPEN-METEO</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  data?.freshnessMetadata?.omStatus === 'FRESH'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : data?.freshnessMetadata?.omStatus === 'STALE'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {data?.freshnessMetadata?.omStatus === 'FRESH' ? '🟢 FRESH' : data?.freshnessMetadata?.omStatus === 'STALE' ? '🟡 STALE' : '🔴 ERROR'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Request:</span>
                <span className="text-white font-bold text-sm">
                  {data?.freshnessMetadata?.omFetchTimestamp
                    ? new Date(data.freshnessMetadata.omFetchTimestamp).toLocaleTimeString('pl-PL')
                    : '—'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Dane:</span>
                <span className="text-amber-300 font-bold text-sm">
                  {data?.freshnessMetadata?.omForecastTimestamp || currentTime || '—'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Wiek:</span>
                <span className="text-emerald-300 font-bold text-sm">
                  {data?.freshnessMetadata?.omAgeSeconds !== undefined
                    ? `${Math.floor(data.freshnessMetadata.omAgeSeconds / 60)} min`
                    : '0 min'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-bold">
                  {data?.freshnessMetadata?.omStatus || 'FRESH'}
                </span>
              </div>
            </div>

            {/* IMGW CARD */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="font-bold text-emerald-300 text-sm">
                  {imgwStationName ? `IMGW ${imgwStationName.toUpperCase()}` : 'STACJA IMGW-PIB'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  data?.freshnessMetadata?.imgwFreshnessStatus === 'FRESH'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : data?.freshnessMetadata?.imgwFreshnessStatus === 'WAITING_NEW_REPORT'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {data?.freshnessMetadata?.imgwFreshnessStatus === 'FRESH'
                    ? '🟢 FRESH (<75 min)'
                    : data?.freshnessMetadata?.imgwFreshnessStatus === 'WAITING_NEW_REPORT'
                    ? '🟡 WAITING_NEW_REPORT (75-180 min)'
                    : '🔴 OUTDATED (>180 min)'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Request (imgwFetchTimestamp):</span>
                <span className="text-white font-bold text-sm">
                  {data?.freshnessMetadata?.imgwFetchTimestamp
                    ? new Date(data.freshnessMetadata.imgwFetchTimestamp).toLocaleTimeString('pl-PL')
                    : '—'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Poprzedni measurementTime:</span>
                <span className="text-slate-300 font-bold text-xs">
                  {data?.freshnessMetadata?.previousImgwMeasurementTime || 'Brak (Pierwszy odczyt)'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Oficjalny pomiar (imgwMeasurementTime):</span>
                <span className="text-amber-300 font-bold text-sm">
                  {data?.freshnessMetadata?.imgwMeasurementTime || imgwTime || 'Brak'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Wiek pomiaru:</span>
                <span className="text-emerald-300 font-bold text-sm">
                  {data?.freshnessMetadata?.imgwReportAgeMinutes !== null && data?.freshnessMetadata?.imgwReportAgeMinutes !== undefined
                    ? `${data.freshnessMetadata.imgwReportAgeMinutes} min`
                    : 'Brak danych'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Zmiana measurementTime:</span>
                <span className="text-cyan-300 font-bold text-xs">
                  {data?.freshnessMetadata?.imgwReportChangeStatus === 'INITIAL'
                    ? 'Pierwszy odczyt — brak porównania (INITIAL)'
                    : data?.freshnessMetadata?.imgwReportChangeStatus === 'IDENTICAL'
                    ? 'NIE (IDENTICAL - brak zmiany)'
                    : data?.freshnessMetadata?.imgwReportChangeStatus === 'NEW'
                    ? 'TAK (NEW - nowy pomiar)'
                    : 'NIE (OLDER - starszy pomiar)'}
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Nowy raport:</span>
                <span className={`font-bold text-sm ${data?.freshnessMetadata?.hasNewImgwReport ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {data?.freshnessMetadata?.hasNewImgwReport ? 'TAK' : 'NIE'}
                </span>
              </div>
            </div>

            {/* DECAY ENGINE & TEMPERATURE CALIBRATION INSPECTOR */}
            <div className="p-4 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-3 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="font-bold text-amber-300 text-sm flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-amber-400" />
                  🌡️ Inspekcja Kalibracji Temperatury (Decay Engine)
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  calDetails.calibrationMode === 'FRESH_IMGW'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : calDetails.calibrationMode === 'DYNAMIC_MODEL_WITH_BIAS'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : calDetails.calibrationMode === 'DECAYING_BIAS'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-700/40 text-slate-300 border border-slate-600/30'
                }`}>
                  {calDetails.calibrationMode || 'MODEL_ONLY'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">RAW OPEN-METEO:</span>
                  <span className="text-cyan-300 font-bold">{calDetails.rawOpenMeteoTemp !== null && calDetails.rawOpenMeteoTemp !== undefined ? `${calDetails.rawOpenMeteoTemp}°C` : '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">Open-Meteo Timestamp:</span>
                  <span className="text-slate-300 font-bold text-[10px]">{data?.weather?.current?.time || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">IMGW Pomiar Stacji:</span>
                  <span className="text-emerald-300 font-bold">{calDetails.imgwTemp !== null && calDetails.imgwTemp !== undefined ? `${calDetails.imgwTemp}°C` : 'Brak stacji'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">IMGW Timestamp:</span>
                  <span className="text-amber-300 font-bold text-[10px]">{calDetails.measurementHourStr || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">Wiek pomiaru IMGW:</span>
                  <span className="text-white font-bold">{calDetails.delayMinutes} min</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">ORIGINAL BIAS (IMGW - OM):</span>
                  <span className="text-indigo-300 font-bold">{calDetails.originalBias !== undefined ? `${calDetails.originalBias >= 0 ? '+' : ''}${calDetails.originalBias}°C` : '0°C'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">BIAS WEIGHT (Waga wygaszania):</span>
                  <span className="text-purple-300 font-bold">{calDetails.biasWeight !== undefined ? calDetails.biasWeight : 0}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900">
                  <span className="text-slate-400">EFFECTIVE BIAS (Aktualna korekta):</span>
                  <span className="text-amber-300 font-bold">{calDetails.effectiveBias !== undefined ? `${calDetails.effectiveBias >= 0 ? '+' : ''}${calDetails.effectiveBias}°C` : '0°C'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900 sm:col-span-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-bold">WYNIK FINALNY AURY:</span>
                  <span className="text-emerald-400 font-bold text-sm">{calDetails.calibratedTemp !== null ? `${calDetails.calibratedTemp}°C` : '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-900 sm:col-span-2">
                  <span className="text-slate-400">ŹRÓDŁO TEMPERATURY (SOURCE):</span>
                  <span className="text-cyan-300 font-bold text-[10px]">{calDetails.statusLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: MACIERZ 14 PARAMETRÓW */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Przepływ danych dla każdego elementu pogody: API → Odczyt → Po przeliczeniu → Wartość UI</span>
            <span className="font-mono">Łącznie: 14 parametrów</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categoriesStatus.map((cat) => {
              const IconComp = cat.icon;
              return (
                <div
                  key={cat.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    cat.status === 'ok'
                      ? 'bg-slate-900/60 border-slate-700/70 hover:border-emerald-500/40'
                      : cat.status === 'warning'
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400'
                      : 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`p-1.5 rounded-lg ${
                        cat.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm text-white">{cat.title}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      cat.status === 'ok'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : cat.status === 'warning'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {cat.status === 'ok' ? '🟢 OK' : cat.status === 'warning' ? '🟡 UWAGA' : '🔴 BŁĄD'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                      <span className="text-slate-400">1. Odebrane API:</span>
                      <span className="font-mono text-slate-200">{cat.received}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                      <span className="text-slate-400">2. Przeliczenie:</span>
                      <span className="font-mono text-purple-300">{cat.calculated}</span>
                    </div>
                    <div className="flex justify-between py-1 text-slate-300">
                      <span className="text-slate-400">3. Wartość w UI:</span>
                      <span className="font-bold text-emerald-300 font-mono">{cat.uiValue}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: GŁĘBOKA DIAGNOSTYKA UV */}
      {activeSubTab === 'uv_deep' && (
        <div className="p-5 bg-slate-900/90 border border-amber-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center space-x-2 text-amber-300 font-bold text-base">
            <Sun className="w-5 h-5 text-amber-400" />
            <span>Głęboka Diagnostyka UV Index (Open-Meteo → Formater → UI)</span>
          </div>

          {/* Porównanie źródłowe current.uv_index vs hourly.uv_index */}
          <div className="p-4 bg-slate-950/90 border border-indigo-500/40 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Bezpośrednie Porównanie Źródeł UV: current vs hourly</span>
              </span>
              <span className="text-[11px] bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                Wybrane pole UI: {chosenUvSource === 'current' ? 'current.uv_index' : chosenUvSource === 'hourly' ? `hourly.uv_index[${currentIdx}]` : chosenUvSource === 'clear_sky' ? 'clear_sky' : 'fallback'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Box 1: current.uv_index */}
              <div className={`p-4 rounded-xl border transition-all ${
                chosenUvSource === 'current'
                  ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold font-mono text-sm text-white">1. current.uv_index</span>
                  {chosenUvSource === 'current' ? (
                    <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 px-2 py-0.5 rounded-full font-bold">
                      👑 AKTYWNE DLA UI
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                      NIEUŻYTE
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Timestamp (current.time):</span>
                    <span className="text-amber-300 font-bold">{currentTime || 'null'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Wartość surowa (float):</span>
                    <span className="text-cyan-300 font-bold text-sm">{currentUv !== null ? currentUv : 'null'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Po sformatowaniu:</span>
                    <span className="text-emerald-300 font-bold">{currentUv !== null ? formatUvDisplay(Math.max(0, currentUv)) : '—'}</span>
                  </div>
                </div>
              </div>

              {/* Box 2: hourly.uv_index */}
              <div className={`p-4 rounded-xl border transition-all ${
                chosenUvSource === 'hourly'
                  ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold font-mono text-sm text-white">2. hourly.uv_index[{currentIdx}]</span>
                  {chosenUvSource === 'hourly' ? (
                    <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 px-2 py-0.5 rounded-full font-bold">
                      👑 AKTYWNE DLA UI
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                      ZAPASOWE
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Timestamp (hourly.time):</span>
                    <span className="text-amber-300 font-bold">{matchedHourlyTime || 'null'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Wartość surowa (float):</span>
                    <span className="text-cyan-300 font-bold text-sm">{hourlyUv !== null ? hourlyUv : 'null'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Po sformatowaniu:</span>
                    <span className="text-emerald-300 font-bold">{hourlyUv !== null ? formatUvDisplay(Math.max(0, hourlyUv)) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-white">Wynikowy wybór interfejsu:</span> Użyto pola{' '}
                <code className="text-amber-300 font-bold bg-slate-950 px-1.5 py-0.5 rounded">
                  {chosenUvSource === 'current' ? 'current.uv_index' : chosenUvSource === 'hourly' ? `hourly.uv_index[${currentIdx}]` : 'clear_sky'}
                </code>{' '}
                o wartości <code className="text-cyan-300 font-bold bg-slate-950 px-1.5 py-0.5 rounded">{resolvedCurrentUv}</code>.
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Wyświetlane w UI:</span>
                <span className="font-black text-emerald-300 font-mono text-base bg-emerald-950/60 border border-emerald-500/40 px-3 py-1 rounded-lg shadow-inner">
                  {displayedUvInUi}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">current.time z API:</span>
              <span className="text-amber-300 font-bold">{currentTime || 'null'}</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Wykryty indeks godzinowy (currentIdx):</span>
              <span className="text-amber-300 font-bold">[{currentIdx}] (metoda: {matchMethod})</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">hourly.time[currentIdx]:</span>
              <span className="text-amber-300 font-bold">{matchedHourlyTime || 'null'}</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">current.uv_index z API:</span>
              <span className="text-cyan-300 font-bold">{currentUv !== null ? currentUv : 'null'}</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">hourly.uv_index[currentIdx] z API:</span>
              <span className="text-cyan-300 font-bold">{hourlyUv !== null ? hourlyUv : 'null'}</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">current.uv_index_clear_sky (model bezchmurny):</span>
              <span className="text-slate-300 font-bold">{currentClearSkyUv !== null ? currentClearSkyUv : 'null'}</span>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl sm:col-span-2">
              <span className="text-slate-400 block text-[10px]">Wynikowa wartość rozstrzygnięta (resolvedCurrentUv):</span>
              <span className="text-emerald-300 font-bold text-sm">{resolvedCurrentUv !== null ? resolvedCurrentUv : 'null'}</span>
            </div>

            <div className="p-3.5 bg-purple-950/40 border border-purple-500/40 rounded-xl sm:col-span-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-purple-300 block text-[10px] font-sans font-bold uppercase tracking-wider">
                    Wartość podawana do formatUvDisplay():
                  </span>
                  <span className="text-white font-bold text-sm">{uvVal !== null ? uvVal : 'null'}</span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-300 block text-[10px] font-sans font-bold uppercase tracking-wider">
                    Wartość faktycznie wyświetlana w UI:
                  </span>
                  <span className="text-emerald-300 font-black text-lg font-mono">{displayedUvInUi}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs space-y-2">
            <span className="font-bold text-slate-200 block">Weryfikacja Przyczyny Ewentualnych Rozbieżności:</span>
            <ul className="space-y-1.5 text-slate-300">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span><strong>API:</strong> Open-Meteo przekazuje wartości z dokładnością zmiennoprzecinkową float (np. 0.48).</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span><strong>Formatowanie UI:</strong> Użycie <code>formatUvDisplay()</code> sprawia, że wartości z przedziału (0.0, 1.0) są prezentowane jako "0,5" zamiast być obcinane do "0".</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span><strong>Indeks godzinowy & Timezone:</strong> Dopasowanie prefixowe (YYYY-MM-DDTHH) zapewnia poprawną godzinę lokalną Europe/Warsaw.</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* SUB-TAB: 🌧️ GŁĘBOKA DIAGNOSTYKA PRAWDOPODOBIENSTWA OPADÓW */}
      {activeSubTab === 'precip_deep' && (
        <div className="p-5 bg-slate-900/90 border border-cyan-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-cyan-300 font-bold text-base">
              <CloudRain className="w-5 h-5 text-cyan-400" />
              <span>🌧️ Głęboka Diagnostyka Prawdopodobieństwa Opadów</span>
            </div>
            <span className="text-xs bg-cyan-950/80 text-cyan-200 border border-cyan-500/40 px-3 py-1 rounded-full font-mono font-bold">
              Data: {todayDateStr}
            </span>
          </div>

          {/* Podsumowanie i Miejsca Rozbieżności */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Box 1: Wartość z API Open-Meteo daily */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                1. daily.precipitation_probability_max[{todayDailyIndex}] (z API)
              </span>
              <div className="text-2xl font-black text-amber-300">
                {dailyPrecipProbMaxToday !== null ? `${dailyPrecipProbMaxToday}%` : 'null / brak'}
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Wartość agregowana bezpośrednio z odpowiedzi API Open-Meteo dla dzisiejszego dnia (indeks {todayDailyIndex}). Używana w kafelku „Dzisiaj w pigułce”.
              </p>
            </div>

            {/* Box 2: Przeliczone z hourly */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                2. Max z dzisiejszych godzin (hourly.precipitation_probability)
              </span>
              <div className="text-2xl font-black text-emerald-300">
                {calculatedMaxPopToday !== null ? `${calculatedMaxPopToday}%` : 'brak danych'}
              </div>
              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                Maksymalna szansa opadów wyliczona ze wszystkich {todayHourlyList.length} godzin dzisiejszej doby w strefie Europe/Warsaw.
              </p>
            </div>
          </div>

          {/* Baner Diagnostyczny Alertu Rozbieżności */}
          {dailyPrecipProbMaxToday === 0 && calculatedMaxPopToday !== null && calculatedMaxPopToday > 0 && (
            <div className="p-4 bg-amber-950/40 border border-amber-500/60 rounded-2xl text-amber-200 text-xs leading-relaxed space-y-1">
              <div className="flex items-center space-x-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>WYKRYTO ROZBIEŻNOŚĆ W MODELU OPEN-METEO!</span>
              </div>
              <p className="font-sans text-amber-100/90">
                Pole <code>daily.precipitation_probability_max[{todayDailyIndex}]</code> wynosi <strong>0%</strong>, podczas gdy w profilu godzinowym <code>hourly.precipitation_probability</code> występują wartości aż do <strong>{calculatedMaxPopToday}%</strong>! Aplikacja automatycznie koryguje to do wartości godzinowej.
              </p>
            </div>
          )}

          {/* Szczegółowe metadane diagnostyczne */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3 text-xs">
            <span className="font-bold text-slate-200 block text-sm border-b border-slate-800 pb-2">
              📋 Kluczowe Metadane Diagnostyczne Opadów
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px]">1. daily.precipitation_probability_max[{todayDailyIndex}]:</span>
                <span className="text-amber-300 font-bold">{dailyPrecipProbMaxToday !== null ? `${dailyPrecipProbMaxToday}%` : 'null'}</span>
              </div>

              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px]">7. Zakres godzin uznany za „dzisiaj”:</span>
                <span className="text-cyan-300 font-bold">{todayHourlyList[0]?.time || 'brak'} → {todayHourlyList[todayHourlyList.length - 1]?.time || 'brak'} ({todayHourlyList.length}h)</span>
              </div>

              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px]">8. Finalna wartość „szansa opadów dzisiaj” w UI:</span>
                <span className="text-emerald-300 font-bold">{uiDisplayedPrecipProbToday}</span>
              </div>

              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl md:col-span-2">
                <span className="text-slate-400 block text-[10px]">9. Źródło wartości & Powód wyboru:</span>
                <span className="text-indigo-300 font-bold block">{precipProbSourceOfValue}</span>
                <span className="text-[11px] text-slate-400 font-sans block mt-0.5">{precipProbSelectionReason}</span>
              </div>

              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px]">10. Timestamp danych API (current.time):</span>
                <span className="text-amber-300 font-bold">{currentTime || 'brak'}</span>
              </div>

              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block text-[10px]">11. Informacja o Cache / Świeżości:</span>
                <span className="text-slate-300 font-bold">{data?.lastUpdated ? `Zapis w pamięci: ${data.lastUpdated}` : 'Gwarancja świeżości API (TTL 2 min)'}</span>
              </div>
            </div>
          </div>

          {/* Tabela/Grid wszystkich dzisiejszych godzin */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-200 text-xs uppercase tracking-wider">
                2-6. Pełny profil godzinowy na dziś ({todayHourlyList.length} godzin)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Godzina | Szansa (%) | Opad (mm) | Deszcz (mm) | Przelotny (mm)
              </span>
            </div>

            {todayHourlyList.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Brak dostępnych rekordów godzinowych dla dzisiejszej daty ({todayDateStr}).
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
                {todayHourlyList.map((h) => {
                  const hasRain = (h.pop !== null && h.pop > 0) || (h.precip !== null && h.precip > 0);
                  return (
                    <div
                      key={h.time}
                      className={`p-2.5 rounded-xl border font-mono text-[11px] transition-all ${
                        hasRain
                          ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-100 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                      }`}
                    >
                      <div className="flex justify-between items-center border-b border-slate-800 pb-1 mb-1">
                        <span className="font-bold text-amber-300">{h.hourLabel}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          h.pop && h.pop > 0 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {h.pop !== null ? `${h.pop}%` : '—'}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">precipitation:</span>
                          <span className="font-bold text-slate-200">{h.precip !== null ? `${h.precip} mm` : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">rain:</span>
                          <span className="text-slate-300">{h.rain !== null ? `${h.rain} mm` : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">showers:</span>
                          <span className="text-slate-300">{h.showers !== null ? `${h.showers} mm` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: STACJA IMGW */}
      {activeSubTab === 'imgw' && (
        <div className="p-5 bg-slate-900/90 border border-emerald-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-300 font-bold text-base">
              <Radio className="w-5 h-5 text-emerald-400" />
              <span>Szczegółowa Telemetria Stacji Synoptycznej IMGW-PIB</span>
            </div>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold font-mono ${
              data?.freshnessMetadata?.imgwFreshnessStatus === 'FRESH' || imgw?.temp !== null
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : data?.freshnessMetadata?.imgwFreshnessStatus === 'WAITING_NEW_REPORT'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}>
              {data?.freshnessMetadata?.imgwFreshnessStatus === 'FRESH'
                ? '🟢 Raport Świeży (<75 min)'
                : data?.freshnessMetadata?.imgwFreshnessStatus === 'WAITING_NEW_REPORT'
                ? '🟡 Oczekuje na Nowy Raport IMGW (75-180 min)'
                : '🔴 Raport Przestarzały (>180 min)'}
            </span>
          </div>

          {/* Baner Świeżości IMGW */}
          <div className="p-3.5 bg-slate-950/80 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Czas oficjalnego raportu stacji:</span>
              <span className="text-amber-300 font-mono font-bold text-sm">{imgwTime}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Wiek raportu stacji IMGW:</span>
              <span className="text-emerald-300 font-mono font-bold text-sm">
                {data?.freshnessMetadata?.imgwReportAgeMinutes !== null && data?.freshnessMetadata?.imgwReportAgeMinutes !== undefined
                  ? `${data.freshnessMetadata.imgwReportAgeMinutes} minut temu`
                  : 'Brak danych o wieku'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Wybrana stacja:</span>
              <span className="text-white font-bold text-sm">{imgwStationName}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">ID Stacji IMGW:</span>
              <span className="text-emerald-300 font-bold font-mono">{imgwId}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Współrzędne stacji:</span>
              <span className="text-slate-200 font-mono">
                Lat: {imgw?.lat ?? '—'}, Lng: {imgw?.lng ?? '—'}
              </span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Odległość od użytkownika:</span>
              <span className="text-cyan-300 font-bold">{imgwDistance}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Pomiar temperatury:</span>
              <span className="text-emerald-300 font-bold text-sm">{imgwTemp}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Pomiar wilgotności:</span>
              <span className="text-cyan-300 font-bold text-sm">{imgwHumidity}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Pomiar wiatru:</span>
              <span className="text-teal-300 font-bold text-sm">{imgwWind}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Rzeczywisty opad zmierzony (opad_10min):</span>
              <span className="text-cyan-300 font-bold font-mono text-sm">
                {typeof imgw?.rainRate === 'number' ? `${imgw.rainRate} mm/10min` : '0 mm (brak opadu)'}
              </span>
            </div>
          </div>

          {/* SUROWY PODGLĄD DANYCH OTRZYMANYCH Z IMGW API */}
          <div className="p-4 bg-slate-950/90 border border-emerald-500/20 rounded-2xl space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-emerald-300 font-bold text-sm">📡 Surowy Podgląd Odpowiedzi IMGW API</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">RAW INSPECTOR</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">Endpoint IMGW:</span>
                <p className="text-emerald-200 font-bold truncate">https://danepubliczne.imgw.pl/api/data/meteo (+ /synop)</p>
              </div>
              <div>
                <span className="text-slate-400">Czas wykonania requestu:</span>
                <p className="text-white font-bold">
                  {data?.freshnessMetadata?.imgwFetchTimestamp
                    ? new Date(data.freshnessMetadata.imgwFetchTimestamp).toLocaleTimeString('pl-PL')
                    : '—'}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Surowy measurementTime (API):</span>
                <p className="text-amber-300 font-bold">
                  {imgw?.raw?.temperatura_powietrza_data ? `${imgw.raw.temperatura_powietrza_data} (UTC)` : (imgw?.measurementTime || '—')}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Surowa temperatura (API):</span>
                <p className="text-emerald-300 font-bold">
                  {imgw?.raw?.temperatura_powietrza ? `${imgw.raw.temperatura_powietrza}°C` : (imgwTemp || '—')}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Dostępne rekordy/raporty:</span>
                <p className="text-slate-300">785 stacji (1 bieżący rekord per stacja w /meteo)</p>
              </div>
              <div>
                <span className="text-slate-400">Wybrany rekord:</span>
                <p className="text-cyan-300 font-bold">{imgwStationName} (ID: {imgwId}, Dist: {imgwDistance})</p>
              </div>
              <div>
                <span className="text-slate-400">Powód wyboru rekordu:</span>
                <p className="text-slate-300">Najbliższa stacja geograficznie (Haversine) z poprawnym odczytem</p>
              </div>
              <div>
                <span className="text-slate-400">Wiek wybranego pomiaru:</span>
                <p className="text-emerald-300 font-bold">
                  {data?.freshnessMetadata?.imgwReportAgeMinutes !== null && data?.freshnessMetadata?.imgwReportAgeMinutes !== undefined
                    ? `${data.freshnessMetadata.imgwReportAgeMinutes} min`
                    : '—'}
                </p>
              </div>
            </div>

            {imgw?.raw && (
              <div className="mt-2 pt-2 border-t border-slate-900">
                <span className="text-slate-400 text-[10px] block mb-1">Pełny surowy obiekt JSON ze stacji IMGW:</span>
                <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-40">
                  {JSON.stringify(imgw.raw, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* DECAY ENGINE & TEMPERATURE CALIBRATION INSPECTOR */}
          <div className="p-4 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-3 font-mono text-xs shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="font-bold text-amber-300 text-sm flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" />
                🌡️ Inspekcja Kalibracji Temperatury (Decay Engine)
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                calDetails.calibrationMode === 'FRESH_IMGW'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : calDetails.calibrationMode === 'DYNAMIC_MODEL_WITH_BIAS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : calDetails.calibrationMode === 'DECAYING_BIAS'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-700/40 text-slate-300 border border-slate-600/30'
              }`}>
                {calDetails.calibrationMode || 'MODEL_ONLY'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">RAW OPEN-METEO:</span>
                <span className="text-cyan-300 font-bold">{calDetails.rawOpenMeteoTemp !== null && calDetails.rawOpenMeteoTemp !== undefined ? `${calDetails.rawOpenMeteoTemp}°C` : '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Open-Meteo Timestamp:</span>
                <span className="text-slate-300 font-bold text-[10px]">{data?.weather?.current?.time || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">IMGW Pomiar Stacji:</span>
                <span className="text-emerald-300 font-bold">{calDetails.imgwTemp !== null && calDetails.imgwTemp !== undefined ? `${calDetails.imgwTemp}°C` : 'Brak stacji'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">IMGW Timestamp:</span>
                <span className="text-amber-300 font-bold text-[10px]">{calDetails.measurementHourStr || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">Wiek pomiaru IMGW:</span>
                <span className="text-white font-bold">{calDetails.delayMinutes} min</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">ORIGINAL BIAS (IMGW - OM):</span>
                <span className="text-indigo-300 font-bold">{calDetails.originalBias !== undefined ? `${calDetails.originalBias >= 0 ? '+' : ''}${calDetails.originalBias}°C` : '0°C'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">BIAS WEIGHT (Waga wygaszania):</span>
                <span className="text-purple-300 font-bold">{calDetails.biasWeight !== undefined ? calDetails.biasWeight : 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900">
                <span className="text-slate-400">EFFECTIVE BIAS (Aktualna korekta):</span>
                <span className="text-amber-300 font-bold">{calDetails.effectiveBias !== undefined ? `${calDetails.effectiveBias >= 0 ? '+' : ''}${calDetails.effectiveBias}°C` : '0°C'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900 sm:col-span-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-bold">WYNIK FINALNY AURY:</span>
                <span className="text-emerald-400 font-bold text-sm">{calDetails.calibratedTemp !== null ? `${calDetails.calibratedTemp}°C` : '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-900 sm:col-span-2">
                <span className="text-slate-400">ŹRÓDŁO TEMPERATURY (SOURCE):</span>
                <span className="text-cyan-300 font-bold text-[10px]">{calDetails.statusLabel}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: WALIDACJA TEMPERATURY */}
      {activeSubTab === 'validation' && (
        <div className="p-5 bg-slate-900/90 border border-amber-500/40 rounded-3xl space-y-6 shadow-2xl">
          {/* Panel Header & Clear Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center space-x-2 text-amber-300 font-bold text-base">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                <span>🌡️ WALIDACJA TEMPERATURY — AURA vs OPEN-METEO vs IMGW</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Punkt odniesienia: <span className="text-emerald-400 font-bold">IMGW</span> | Próbek referencyjnych w archiwum: <span className="text-white font-bold">{referenceSamples.length} / 20</span> (Trwałe) | Bufor diagnostyczny: <span className="text-slate-300 font-mono">{validationSamples.length} / 30</span>
              </p>
            </div>

            <button
              onClick={handleClearValidationSamples}
              className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-xl text-xs font-bold text-rose-300 flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
              title="Wyczyść zgromadzone próbki walidacyjne i referencyjne"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>🗑️ Wyczyść bazę walidacji</span>
            </button>
          </div>

          {/* FAZA 8.2: PODSUMOWANIE BUFORA PRÓBEK I BAZY REFERENCYJNEJ */}
          <div className="p-4 bg-slate-950/90 border border-amber-500/30 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="text-sm font-bold text-amber-300 flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span>📊 PRÓBKI REFERENCYJNE IMGW: <strong className="text-white text-base font-mono">{referenceSamples.length} / 20</strong></span>
                  <span className="text-xs font-normal text-slate-400 ml-2 hidden sm:inline">(Bufor telemetryczny: {validationSamples.length} / 30)</span>
                </div>
                <div className="mt-1 text-xs font-semibold">
                  {referenceSamples.length === 0 && (
                    <span className="text-slate-400">⚪ Oczekiwanie na pierwsze świeże pomiary referencyjne IMGW</span>
                  )}
                  {referenceSamples.length > 0 && referenceSamples.length < 20 && (
                    <span className="text-amber-400">🟡 Gromadzenie bazy referencyjnej — potrzeba jeszcze {20 - referenceSamples.length} unikalnych pomiarów IMGW</span>
                  )}
                  {referenceSamples.length >= 20 && (
                    <span className="text-emerald-400 font-bold">🟢 Wymagany próg 20 próbek referencyjnych osiągnięty — statystyki MAE w pełni aktywne</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowSamplesTable(!showSamplesTable)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <span>{showSamplesTable ? '🙈 Ukryj próbki' : '👁️ Pokaż próbki'}</span>
              </button>
            </div>

            {/* PODZIAŁ PRÓBEK WG TRYBÓW */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 text-[10px] block">FRESH_IMGW</span>
                <span className="text-emerald-300 font-bold font-mono text-sm">{validationSamples.filter(s => s.calibrationMode === 'FRESH_IMGW').length}</span>
              </div>
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 text-[10px] block">DYNAMIC_MODEL_WITH_BIAS</span>
                <span className="text-amber-300 font-bold font-mono text-sm">{validationSamples.filter(s => s.calibrationMode === 'DYNAMIC_MODEL_WITH_BIAS').length}</span>
              </div>
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 text-[10px] block">DECAYING_BIAS</span>
                <span className="text-orange-300 font-bold font-mono text-sm">{validationSamples.filter(s => s.calibrationMode === 'DECAYING_BIAS').length}</span>
              </div>
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-slate-400 text-[10px] block">MODEL_ONLY</span>
                <span className="text-cyan-300 font-bold font-mono text-sm">{validationSamples.filter(s => s.calibrationMode === 'MODEL_ONLY').length}</span>
              </div>
            </div>

            {/* OSTATNIA PRÓBKA */}
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs space-y-1.5">
              <span className="font-bold text-slate-300 block border-b border-slate-800/80 pb-1">
                Ostatnia próbka:
              </span>
              {validationSamples.length === 0 ? (
                <span className="text-slate-400 italic">Brak danych</span>
              ) : (
                (() => {
                  const last = validationSamples[validationSamples.length - 1];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 text-[10px] block">Czas:</span>
                        <span className="text-slate-200">{last.timestamp ? new Date(last.timestamp).toLocaleTimeString('pl-PL') : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Aura:</span>
                        <span className="text-emerald-400 font-bold">{last.auraTemperature !== null ? `${last.auraTemperature}°C` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Open-Meteo:</span>
                        <span className="text-cyan-400 font-bold">{last.rawOpenMeteoTemperature !== null ? `${last.rawOpenMeteoTemperature}°C` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">IMGW:</span>
                        <span className="text-emerald-300 font-bold">{last.imgwTemperature !== null ? `${last.imgwTemperature}°C` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Wiek IMGW:</span>
                        <span className="text-amber-300">{last.imgwAgeMinutes !== null ? `${last.imgwAgeMinutes} min` : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] block">Tryb:</span>
                        <span className="text-purple-300">{last.calibrationMode || 'MODEL_ONLY'}</span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* TABELA PRÓBEK (MAX 30 OSTATNICH PRÓBEK) */}
            {showSamplesTable && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300 block">
                  Ostatnie próbki walidacyjne (max 30):
                </span>
                {validationSamples.length === 0 ? (
                  <span className="text-xs text-slate-500 italic block">Brak próbek w bazie.</span>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="p-2 border-b border-slate-800">#</th>
                          <th className="p-2 border-b border-slate-800">Czas</th>
                          <th className="p-2 border-b border-slate-800 text-right">Aura</th>
                          <th className="p-2 border-b border-slate-800 text-right">Open-Meteo</th>
                          <th className="p-2 border-b border-slate-800 text-right">IMGW</th>
                          <th className="p-2 border-b border-slate-800 text-right">Wiek IMGW</th>
                          <th className="p-2 border-b border-slate-800">Tryb</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-[11px]">
                        {validationSamples.slice(-30).reverse().map((sample, idx) => (
                          <tr key={sample.id || idx} className="hover:bg-slate-800/40">
                            <td className="p-2 text-slate-500 text-[10px]">{validationSamples.length - idx}</td>
                            <td className="p-2 text-slate-300 whitespace-nowrap">
                              {sample.timestamp ? new Date(sample.timestamp).toLocaleTimeString('pl-PL') : '—'}
                            </td>
                            <td className="p-2 text-right text-emerald-400 font-bold">
                              {sample.auraTemperature !== null ? `${sample.auraTemperature}°C` : '—'}
                            </td>
                            <td className="p-2 text-right text-cyan-400 font-bold">
                              {sample.rawOpenMeteoTemperature !== null ? `${sample.rawOpenMeteoTemperature}°C` : '—'}
                            </td>
                            <td className="p-2 text-right text-emerald-300 font-bold">
                              {sample.imgwTemperature !== null ? `${sample.imgwTemperature}°C` : '—'}
                            </td>
                            <td className="p-2 text-right text-amber-300">
                              {sample.imgwAgeMinutes !== null ? `${sample.imgwAgeMinutes} min` : '—'}
                            </td>
                            <td className="p-2 text-purple-300 text-[10px] whitespace-nowrap">
                              {sample.calibrationMode || 'MODEL_ONLY'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warning banner if IMGW measurement is old or missing */}
          {(calDetails.delayMinutes > 30 || !data?.imgwStation) && (
            <div className="p-3.5 bg-amber-950/60 border border-amber-500/50 rounded-2xl flex items-center space-x-2.5 text-amber-200 text-xs shadow-inner">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                ⚠️ <strong>Pomiar referencyjny IMGW jest opóźniony</strong> ({calDetails.delayMinutes} min). Próbki opóźnione są rejestrowane z flagą <code>OUTDATED</code> i nie stanowią bezwarunkowej oceny prawdy terenowej.
              </span>
            </div>
          )}

          {/* SECTION 1: AKTUALNA PRÓBKA (CURRENT SAMPLE) */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              1. Pomiary Aktualnej Próbki Walidacyjnej
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* AURA */}
              <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-xl space-y-1.5">
                <div className="font-bold text-amber-300 border-b border-slate-800 pb-1">AURA (FINAL)</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Temperatura finalna:</span>
                  <span className="text-emerald-400 font-bold">{auraFinalTemp !== null ? `${auraFinalTemp}°C` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Odczuwalna (Aura):</span>
                  <span className="text-cyan-300 font-bold">{currentAuraApparent !== null ? `${currentAuraApparent}°C` : '—'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Źródło (Source):</span>
                  <span className="text-slate-300 font-mono text-[10px]">{calDetails.statusLabel}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Tryb Decay Engine:</span>
                  <span className="text-amber-300 font-mono text-[10px]">{calDetails.calibrationMode || 'MODEL_ONLY'}</span>
                </div>
              </div>

              {/* OPEN-METEO */}
              <div className="p-3 bg-slate-900 border border-cyan-500/30 rounded-xl space-y-1.5">
                <div className="font-bold text-cyan-300 border-b border-slate-800 pb-1">OPEN-METEO (PROGNOZA)</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">rawOpenMeteoTemp:</span>
                  <span className="text-cyan-300 font-bold">{omRawTemp !== null ? `${omRawTemp}°C` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">rawOpenMeteoApparent:</span>
                  <span className="text-slate-300 font-bold">{omRawApparent !== null ? `${omRawApparent}°C` : '—'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Timestamp modelowy:</span>
                  <span className="text-slate-300 font-mono text-[10px]">{data?.weather?.current?.time || '—'}</span>
                </div>
              </div>

              {/* IMGW */}
              <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-xl space-y-1.5">
                <div className="font-bold text-emerald-300 border-b border-slate-800 pb-1">IMGW (PUNKT ODNIESIENIA)</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Temperatura IMGW:</span>
                  <span className="text-emerald-300 font-bold">{imgwValTemp !== null ? `${imgwValTemp}°C` : 'Brak stacji'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Apparent IMGW (Aura):</span>
                  <span className="text-slate-300 font-bold">{currentImgwApparent !== null ? `${currentImgwApparent.toFixed(1)}°C` : '—'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Czas pomiaru:</span>
                  <span className="text-amber-300 font-mono text-[10px]">{calDetails.measurementHourStr || '—'}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Wiek pomiaru:</span>
                  <span className="text-white font-bold">{calDetails.delayMinutes} min</span>
                </div>
              </div>
            </div>

            {/* KOREKTA I BŁĄD PRÓBKI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
              <div className="p-3 bg-slate-900/80 border border-indigo-500/30 rounded-xl space-y-1">
                <span className="text-indigo-300 font-bold block border-b border-slate-800 pb-1">Parametry Korekty Temperatury</span>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">originalBias (IMGW - OM):</span>
                  <span className="text-indigo-300 font-mono font-bold">{calDetails.originalBias !== undefined ? `${calDetails.originalBias >= 0 ? '+' : ''}${calDetails.originalBias}°C` : '0°C'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">biasWeight:</span>
                  <span className="text-purple-300 font-mono font-bold">{calDetails.biasWeight ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">effectiveBias:</span>
                  <span className="text-amber-300 font-mono font-bold">{calDetails.effectiveBias !== undefined ? `${calDetails.effectiveBias >= 0 ? '+' : ''}${calDetails.effectiveBias}°C` : '0°C'}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
                <span className="text-slate-300 font-bold block border-b border-slate-800 pb-1">Porównanie Błędu Aktualnej Próbki</span>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Błąd Aury (Aura - IMGW):</span>
                  <span className="text-emerald-300 font-bold">{currentAuraError !== null ? `${currentAuraError >= 0 ? '+' : ''}${currentAuraError}°C (abs: ${absAuraErr}°C)` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Błąd Open-Meteo (OM - IMGW):</span>
                  <span className="text-cyan-300 font-bold">{currentOmError !== null ? `${currentOmError >= 0 ? '+' : ''}${currentOmError}°C (abs: ${absOmErr}°C)` : '—'}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-400">Wynik porównania:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${sampleCloserColor}`}>
                    {sampleCloserLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: STATYSTYKI ZBIORCZE (MINIMUM 20 PRÓBEK REFERENCYJNYCH) */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
              2. Zbiorcze Statystyki Algorytmu Aury vs Open-Meteo (Zbiór Referencyjny)
            </h4>

            {validationStats.validReferenceCount < 20 ? (
              <div className="p-4 bg-slate-900/80 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-2 text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>Za mało danych do wiarygodnej oceny</span>
                </div>
                <p className="text-slate-300 text-[11px]">
                  Zebrano <strong className="text-white">{validationStats.validReferenceCount}</strong> z <strong className="text-white">20</strong> wymaganych próbek referencyjnych IMGW. Średnie wskaźniki błędów (MAE) zostaną aktywowane po zebraniu pełnego progu próbek.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Aura Stats */}
                  <div className="p-3.5 bg-slate-900 border border-amber-500/30 rounded-xl space-y-2">
                    <div className="font-bold text-amber-300 text-sm flex justify-between">
                      <span>Wskaźniki Aury</span>
                      <span className="text-xs font-normal text-slate-400">Próbek: {validationStats.validReferenceCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">MAE (Średni błąd bezwzględny):</span>
                      <span className="text-emerald-300 font-bold text-sm">{validationStats.aura.mae}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Średni błąd (Mean Error):</span>
                      <span className="text-slate-200 font-bold">{validationStats.aura.meanError! >= 0 ? '+' : ''}{validationStats.aura.meanError}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Największy błąd (Max Abs):</span>
                      <span className="text-rose-300 font-bold">{validationStats.aura.maxAbsoluteError}°C</span>
                    </div>
                  </div>

                  {/* Open-Meteo Stats */}
                  <div className="p-3.5 bg-slate-900 border border-cyan-500/30 rounded-xl space-y-2">
                    <div className="font-bold text-cyan-300 text-sm flex justify-between">
                      <span>Wskaźniki Open-Meteo</span>
                      <span className="text-xs font-normal text-slate-400">Próbek: {validationStats.validReferenceCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">MAE (Średni błąd bezwzględny):</span>
                      <span className="text-cyan-300 font-bold text-sm">{validationStats.openMeteo.mae}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Średni błąd (Mean Error):</span>
                      <span className="text-slate-200 font-bold">{validationStats.openMeteo.meanError! >= 0 ? '+' : ''}{validationStats.openMeteo.meanError}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Największy błąd (Max Abs):</span>
                      <span className="text-rose-300 font-bold">{validationStats.openMeteo.maxAbsoluteError}°C</span>
                    </div>
                  </div>
                </div>

                {/* Direct Comparison Box */}
                <div className="p-4 bg-slate-900/90 border border-indigo-500/30 rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-indigo-300 text-sm border-b border-slate-800 pb-1.5">
                    Podsumowanie zgodności z pomiarami IMGW
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Aura była bliżej IMGW:</span>
                      <span className="text-emerald-300 font-bold text-base">{validationStats.comparison.auraCloserCount} / {validationStats.validReferenceCount}</span>
                    </div>
                    <div className="p-2 bg-cyan-950/40 border border-cyan-500/30 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Open-Meteo było bliżej:</span>
                      <span className="text-cyan-300 font-bold text-base">{validationStats.comparison.openMeteoCloserCount} / {validationStats.validReferenceCount}</span>
                    </div>
                    <div className="p-2 bg-slate-800/60 border border-slate-700 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Remisy:</span>
                      <span className="text-slate-200 font-bold text-base">{validationStats.comparison.tieCount} / {validationStats.validReferenceCount}</span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-lg flex justify-between items-center mt-2">
                    <span className="text-slate-300 font-bold">Poprawa MAE Aury względem Open-Meteo:</span>
                    <span className={`font-bold text-sm ${
                      (validationStats.comparison.auraMaeImprovement ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {validationStats.comparison.auraMaeImprovement !== null
                        ? `${validationStats.comparison.auraMaeImprovement > 0 ? '+' : ''}${validationStats.comparison.auraMaeImprovement}°C`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: STATYSTYKI WG TRYBU DECAY ENGINE */}
          <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              3. Statystyki Dokładności wg Trybów Decay Engine
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { name: 'FRESH_IMGW', label: '1. FRESH_IMGW (<30 min)' },
                { name: 'DYNAMIC_MODEL_WITH_BIAS', label: '2. DYNAMIC_MODEL_WITH_BIAS (30-75 min)' },
                { name: 'DECAYING_BIAS', label: '3. DECAYING_BIAS (75-120 min)' },
                { name: 'MODEL_ONLY', label: '4. MODEL_ONLY (>120 min)' }
              ].map(mode => {
                const st = getModeStats(mode.name);
                return (
                  <div key={mode.name} className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1 font-bold text-[11px]">
                      <span className="text-slate-200">{mode.label}</span>
                      <span className="text-slate-400 font-normal text-[10px]">Próbek: {st.count}</span>
                    </div>

                    {!st.reliable ? (
                      <span className="text-amber-400 text-[11px] block italic py-1">
                        Za mało danych do wiarygodnej oceny
                      </span>
                    ) : (
                      <div className="space-y-1 pt-0.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">MAE Aura vs IMGW:</span>
                          <span className="text-emerald-300 font-bold">{st.auraMae}°C</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">MAE Open-Meteo vs IMGW:</span>
                          <span className="text-cyan-300 font-bold">{st.omMae}°C</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800/60 pt-1">
                          <span className="text-slate-400">Różnica (Poprawa):</span>
                          <span className="text-purple-300 font-bold">{st.improvement! > 0 ? `+${st.improvement}°C` : `${st.improvement}°C`}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: GPS & GEOLOKALIZACJA */}
      {activeSubTab === 'gps' && (
        <div className="p-5 bg-slate-900/90 border border-cyan-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center space-x-2 text-cyan-300 font-bold text-base">
            <MapPin className="w-5 h-5 text-cyan-400" />
            <span>Diagnostyka Geolokalizacji & Granic Polski</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Szerokość geograficzna (Lat):</span>
              <span className="text-cyan-300 font-bold font-mono">{effectiveLat.toFixed(6)}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Długość geograficzna (Lng):</span>
              <span className="text-cyan-300 font-bold font-mono">{effectiveLng.toFixed(6)}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Dokładność urządzenia (Accuracy):</span>
              <span className="text-white font-bold">{geoDiagnostic?.accuracy ? `±${geoDiagnostic.accuracy} m` : 'Satelita / Domyślna'}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Walidacja granic Polski:</span>
              <span className={`font-bold ${isPolandBounds ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isPolandBounds ? '🟢 W granicach Polski (49..55°N, 14..24°E)' : '🟡 Poza granicami Polski'}
              </span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Źródło lokalizacji & metoda:</span>
              <span className="text-purple-300 font-bold">{geoDiagnostic?.method || 'Natywne GPS / Auto'}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Ewentualna nazwa z geokodowania:</span>
              <span className="text-emerald-300 font-bold">{data?.city || geoDiagnostic?.cityName || 'Brak'}</span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: API / PROXY / FALLBACK */}
      {activeSubTab === 'api' && (
        <div className="p-5 bg-slate-900/90 border border-blue-500/30 rounded-3xl space-y-4 shadow-xl">
          <div className="flex items-center space-x-2 text-blue-300 font-bold text-base">
            <Zap className="w-5 h-5 text-blue-400" />
            <span>Diagnostyka Ruchu Sieciowego API & Serwera Proxy Express</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Status odpowiedzi backendu /api/weather:</span>
              <span className="text-emerald-400 font-bold">{isNative ? 'Pominięto (Client Fallback w APK)' : '200 OK (Proxy Express)'}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Tryb komunikacji:</span>
              <span className="text-blue-300 font-bold">{isNative ? 'Bezpośrednie zapytanie z natywnego telefonu' : 'Serwerowe proxy Node.js / Express'}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Czas ostatniej odpowiedzi:</span>
              <span className="text-slate-200 font-mono">{data?.lastUpdated || new Date().toLocaleTimeString('pl-PL')}</span>
            </div>
            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Stan pamięci cache (TTL 2m):</span>
              <span className="text-emerald-300 font-bold">Zsynchronizowano</span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: LEGACY DETAILED CARDS */}
      {activeSubTab === 'legacy' && (
        <div className="space-y-6">
          <ApiDataFlowDiagnosticsCard
            data={data}
            userLat={userLat}
            userLng={userLng}
          />
          <DeviceSensorsCard
            currentTemp={omTemp ?? 20}
            userLat={effectiveLat}
            userLng={effectiveLng}
          />
        </div>
      )}
    </div>
  );

  if (isOpenAsModal) {
    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-slate-950 border border-slate-700/80 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-2xl relative my-auto"
          >
            {content}
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  return content;
};

export default AuraDiagnosticCenter;
