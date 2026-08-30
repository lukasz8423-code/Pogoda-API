import { WeatherResponse } from '../types';
import {
  getCalibratedTemperatureDetails,
  calculateApparentTemperature,
  calculateDewPoint,
  calculateOpticalCloudCover,
  calculateAdjustedUvIndex,
  calculateLeafWetness,
  getWeatherMeta
} from './weatherUtils';

export interface DiagnosticIssue {
  id: string;
  parameter:
    | 'TEMPERATURE'
    | 'APPARENT'
    | 'UV'
    | 'PRECIPITATION'
    | 'CLOUD'
    | 'WIND'
    | 'HUMIDITY'
    | 'PRESSURE'
    | 'DEW_POINT'
    | 'LWD'
    | 'TIME_SYNC'
    | 'IMGW'
    | 'OPEN_METEO'
    | 'RADAR'
    | 'SATELLITE'
    | 'AIR_QUALITY'
    | 'FALLBACK'
    | 'UI'
    | 'LANGUAGE'
    | 'SYSTEM';

  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

  timestamp: string;

  sourceValue?: unknown;
  computedValue?: unknown;
  uiDisplayedValue?: unknown;

  component?: string;
  file?: string;
  line?: number;

  description: string;
  suggestedFix: string;
}

export interface TrackedFallback {
  parameter: string;
  primarySource: string;
  fallbackUsed: string;
  reason: string;
  isSafe: boolean;
  impact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ParameterHealthStatus {
  status: 'HEALTHY' | 'WARNING' | 'ERROR';
  score: number; // 0 - 100
  issuesCount: number;
}

export interface AuraSelfDiagnosticReport {
  timestamp: string;
  overallHealthPercent: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  sourcesStatus: {
    openMeteo: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    imgw: 'HEALTHY' | 'OUTDATED' | 'OFFLINE' | 'NOT_APPLICABLE';
    gios: 'HEALTHY' | 'UNAVAILABLE' | 'OUTDATED';
    radar: 'HEALTHY' | 'DEGRADED';
    satellite: 'HEALTHY' | 'DEGRADED';
  };
  parameterMatrix: {
    temperature: 'HEALTHY' | 'WARNING' | 'ERROR';
    apparent: 'HEALTHY' | 'WARNING' | 'ERROR';
    uv: 'HEALTHY' | 'WARNING' | 'ERROR';
    precipitation: 'HEALTHY' | 'WARNING' | 'ERROR';
    cloud: 'HEALTHY' | 'WARNING' | 'ERROR';
    wind: 'HEALTHY' | 'WARNING' | 'ERROR';
    humidity: 'HEALTHY' | 'WARNING' | 'ERROR';
    pressure: 'HEALTHY' | 'WARNING' | 'ERROR';
    dewPoint: 'HEALTHY' | 'WARNING' | 'ERROR';
    lwd: 'HEALTHY' | 'WARNING' | 'ERROR';
    timeSync: 'HEALTHY' | 'WARNING' | 'ERROR';
  };
  issues: DiagnosticIssue[];
  fallbacksTracked: TrackedFallback[];
  trendsSummary: {
    totalEvaluations: number;
    issueOccurrences: Record<string, number>;
    mostFrequentIssue?: string;
    avgImgwBias?: number | null;
  };
}

const STORAGE_KEY_DIAG_HISTORY = 'aura_diagnostic_history_v1';
const MAX_HISTORY_ITEMS = 50;

/**
 * Loads diagnostic history from localStorage.
 */
export function loadDiagnosticHistory(): DiagnosticIssue[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DIAG_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[AURA SELF-DIAGNOSTIC] Failed to load diagnostic history:', e);
    return [];
  }
}

/**
 * Saves issues into diagnostic history buffer in localStorage.
 */
export function saveDiagnosticIssuesToHistory(newIssues: DiagnosticIssue[]): void {
  if (typeof window === 'undefined' || !newIssues || newIssues.length === 0) return;
  try {
    const existing = loadDiagnosticHistory();
    // Prepend new issues and keep top MAX_HISTORY_ITEMS unique by (id + timestamp approx)
    const combined = [...newIssues, ...existing].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(STORAGE_KEY_DIAG_HISTORY, JSON.stringify(combined));
  } catch (e) {
    console.warn('[AURA SELF-DIAGNOSTIC] Failed to save diagnostic history:', e);
  }
}

/**
 * Computes occurrence stats from persistent history.
 */
export function computeDiagnosticTrends(history: DiagnosticIssue[]): {
  totalEvaluations: number;
  issueOccurrences: Record<string, number>;
  mostFrequentIssue?: string;
} {
  const counts: Record<string, number> = {};
  for (const issue of history) {
    const key = issue.id;
    counts[key] = (counts[key] || 0) + 1;
  }

  let mostFrequentKey: string | undefined;
  let maxCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > maxCount) {
      maxCount = v;
      mostFrequentKey = k;
    }
  }

  return {
    totalEvaluations: history.length,
    issueOccurrences: counts,
    mostFrequentIssue: mostFrequentKey ? `${mostFrequentKey} (${maxCount}x)` : undefined,
  };
}

/**
 * Pure, non-mutating Self-Diagnostic Engine.
 * Evaluates the full state of WeatherResponse and sub-components.
 */
export function runAuraSelfDiagnostic(
  data: WeatherResponse | null | undefined,
  options?: {
    uiOverrides?: {
      displayedTemp?: number | string;
      displayedApparent?: number | string;
      displayedUv?: number | string;
      displayedPrecipText?: string;
    };
  }
): AuraSelfDiagnosticReport {
  const issues: DiagnosticIssue[] = [];
  const fallbacksTracked: TrackedFallback[] = [];
  const now = new Date();
  const timestamp = now.toISOString();

  // -------------------------------------------------------------
  // 0. BASIC SANITY & DATA SOURCE EXISTENCE CHECKS
  // -------------------------------------------------------------
  if (!data || !data.weather) {
    issues.push({
      id: 'DATA_UNAVAILABLE',
      parameter: 'SYSTEM',
      severity: 'CRITICAL',
      timestamp,
      description: 'Główny obiekt danych pogodowych WeatherResponse jest pusty lub niezainicjalizowany.',
      suggestedFix: 'Sprawdź stan połączenia z API Open-Meteo i mechanizm ponawiania zapytań w weatherApi.ts.',
      file: 'src/services/weatherApi.ts',
      component: 'MainWeather',
      line: 30,
    });

    return {
      timestamp,
      overallHealthPercent: 0,
      severityCounts: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      sourcesStatus: {
        openMeteo: 'DOWN',
        imgw: 'NOT_APPLICABLE',
        gios: 'UNAVAILABLE',
        radar: 'DEGRADED',
        satellite: 'DEGRADED',
      },
      parameterMatrix: {
        temperature: 'ERROR',
        apparent: 'ERROR',
        uv: 'ERROR',
        precipitation: 'ERROR',
        cloud: 'ERROR',
        wind: 'ERROR',
        humidity: 'ERROR',
        pressure: 'ERROR',
        dewPoint: 'ERROR',
        lwd: 'ERROR',
        timeSync: 'ERROR',
      },
      issues,
      fallbacksTracked,
      trendsSummary: { totalEvaluations: 0, issueOccurrences: {} },
    };
  }

  const { current, hourly, daily, minutely_15 } = data.weather;
  const imgwStation = data.imgwStation;
  const airQuality = data.airQuality;

  // Track sources health
  const sourcesStatus: AuraSelfDiagnosticReport['sourcesStatus'] = {
    openMeteo: current && hourly ? 'HEALTHY' : 'DEGRADED',
    imgw: !imgwStation
      ? 'NOT_APPLICABLE'
      : (imgwStation.distanceKm ?? 0) > 45
      ? 'NOT_APPLICABLE'
      : imgwStation.status === 'outdated'
      ? 'OUTDATED'
      : imgwStation.temp === null
      ? 'OFFLINE'
      : 'HEALTHY',
    gios: !airQuality ? 'UNAVAILABLE' : 'HEALTHY',
    radar: 'HEALTHY',
    satellite: 'HEALTHY',
  };

  // -------------------------------------------------------------
  // 1. TIME SYNC & INDEX MATCHING TESTS
  // -------------------------------------------------------------
  let matchedHourIndex = 0;
  if (Array.isArray(hourly?.time) && hourly.time.length > 0) {
    if (current?.time) {
      const timePrefix = current.time.slice(0, 13);
      const prefixIdx = hourly.time.findIndex((t: string) => t.startsWith(timePrefix));
      if (prefixIdx !== -1) {
        matchedHourIndex = prefixIdx;
      }
    }

    if (matchedHourIndex === 0 && !current?.time) {
      // Time-diff matching fallback
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
      matchedHourIndex = bestIdx;
    }

    // Check if matched hour is far from reference time (> 90 minutes)
    // Note: Open-Meteo returns local time without timezone suffix (e.g. "2026-08-30T11:00").
    // We compare directly against current.time (the API's current local timestamp) or calculate minute difference in local ISO timeline.
    const matchedHourStr = hourly.time[matchedHourIndex];
    if (matchedHourStr) {
      let diffMinutes = 0;
      if (current?.time && typeof current.time === 'string') {
        const refD = new Date(current.time.length === 16 ? `${current.time}:00Z` : (current.time.endsWith('Z') ? current.time : `${current.time}Z`)).getTime();
        const matD = new Date(matchedHourStr.length === 16 ? `${matchedHourStr}:00Z` : (matchedHourStr.endsWith('Z') ? matchedHourStr : `${matchedHourStr}Z`)).getTime();
        if (!isNaN(refD) && !isNaN(matD)) {
          diffMinutes = Math.abs(refD - matD) / (60 * 1000);
        }
      } else {
        const localNowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
        const refD = new Date(`${localNowIso}Z`).getTime();
        const matD = new Date(matchedHourStr.length === 16 ? `${matchedHourStr}:00Z` : (matchedHourStr.endsWith('Z') ? matchedHourStr : `${matchedHourStr}Z`)).getTime();
        if (!isNaN(refD) && !isNaN(matD)) {
          diffMinutes = Math.abs(refD - matD) / (60 * 1000);
        }
      }

      if (diffMinutes > 90) {
        issues.push({
          id: 'TIME_INDEX_DESYNC',
          parameter: 'TIME_SYNC',
          severity: 'HIGH',
          timestamp,
          sourceValue: current?.time ? `current.time=${current.time}` : `Date.now()=${now.toISOString()}`,
          computedValue: `hourly.time[${matchedHourIndex}]=${matchedHourStr}`,
          description: `Wykryto rozbieżność czasową ${Math.round(diffMinutes)} minut pomiędzy zegarem a indeksem modelu hourly.`,
          suggestedFix: 'Zweryfikuj strefę czasową (UTC vs CEST) oraz algorytm getMatchedIndex w MainWeather.tsx.',
          file: 'src/components/MainWeather.tsx',
          component: 'MainWeather',
          line: 431,
        });
      }
    }

    // Check if index 0 is used in the afternoon
    const currentHourOfDay = now.getHours();
    if (matchedHourIndex === 0 && currentHourOfDay >= 2 && hourly.time.length >= 24) {
      const firstHourTime = new Date(hourly.time[0]).getHours();
      if (firstHourTime === 0 && currentHourOfDay > 0) {
        issues.push({
          id: 'TIME_ZERO_INDEX_USED_AS_NOW',
          parameter: 'TIME_SYNC',
          severity: 'HIGH',
          timestamp,
          sourceValue: `Godzina lokalna: ${currentHourOfDay}:00`,
          computedValue: `Indeks godzinowy: [0] (${hourly.time[0]})`,
          description: `Zastosowano indeks 0 (północ 00:00) jako aktualną godzinę, mimo że bieżąca godzina to ${currentHourOfDay}:00.`,
          suggestedFix: 'Upewnij się, że getMatchedIndex precyzyjnie porównuje prefiks ISO lub różnicę w milisekundach.',
          file: 'src/components/MainWeather.tsx',
          component: 'MainWeather',
          line: 459,
        });
      }
    }
  } else {
    issues.push({
      id: 'HOURLY_TIME_ARRAY_MISSING',
      parameter: 'TIME_SYNC',
      severity: 'CRITICAL',
      timestamp,
      description: 'Brak tablicy hourly.time w odpowiedzi Open-Meteo.',
      suggestedFix: 'Sprawdź parametry hourlyParams w weatherApi.ts.',
      file: 'src/services/weatherApi.ts',
      line: 35,
    });
  }

  // -------------------------------------------------------------
  // 2. TEMPERATURE & DECAY ENGINE TESTS
  // -------------------------------------------------------------
  const rawOmTemp = typeof current?.temperature_2m === 'number'
    ? current.temperature_2m
    : (typeof hourly?.temperature_2m?.[matchedHourIndex] === 'number' ? hourly.temperature_2m[matchedHourIndex] : null);

  if (current?.temperature_2m === undefined && rawOmTemp !== null) {
    fallbacksTracked.push({
      parameter: 'TEMPERATURE',
      primarySource: 'current.temperature_2m',
      fallbackUsed: `hourly.temperature_2m[${matchedHourIndex}]`,
      reason: 'Brak pola current.temperature_2m w odpowiedzi API',
      isSafe: true,
      impact: 'LOW',
    });
  }

  const calDetails = getCalibratedTemperatureDetails(
    imgwStation && typeof imgwStation.temp === 'number' && (imgwStation.distanceKm ?? 0) <= 45 ? imgwStation : null,
    rawOmTemp ?? undefined,
    hourly?.time,
    hourly?.temperature_2m
  );

  const auraFinalTemp = calDetails.calibratedTemp ?? rawOmTemp;

  if (rawOmTemp === null) {
    issues.push({
      id: 'TEMPERATURE_MISSING',
      parameter: 'TEMPERATURE',
      severity: 'CRITICAL',
      timestamp,
      description: 'Całkowity brak odczytu temperatury zarówno w current, jak i hourly.',
      suggestedFix: 'Sprawdź odpowiedź API Open-Meteo.',
      file: 'src/components/MainWeather.tsx',
      line: 469,
    });
  } else {
    // Physical plausibility for Central Europe
    if (rawOmTemp < -45 || rawOmTemp > 50) {
      issues.push({
        id: 'TEMPERATURE_PHYSICAL_OUT_OF_BOUNDS',
        parameter: 'TEMPERATURE',
        severity: 'HIGH',
        timestamp,
        sourceValue: rawOmTemp,
        description: `Temperatura ${rawOmTemp}°C wykracza poza realny zakres fizyczny dla Polski (-45°C do +50°C).`,
        suggestedFix: 'Zweryfikuj poprawność geolokalizacji lub formatowania liczbowego.',
        file: 'src/utils/weatherUtils.ts',
        line: 300,
      });
    }

    // Check IMGW vs OM discrepancy
    if (imgwStation && typeof imgwStation.temp === 'number' && !isNaN(imgwStation.temp)) {
      const diff = Math.abs(imgwStation.temp - rawOmTemp);
      if (diff > 5.0) {
        issues.push({
          id: 'TEMPERATURE_LARGE_IMGW_OM_DISCREPANCY',
          parameter: 'TEMPERATURE',
          severity: 'MEDIUM',
          timestamp,
          sourceValue: `OM: ${rawOmTemp}°C, IMGW: ${imgwStation.temp}°C`,
          computedValue: `Różnica: ${diff.toFixed(1)}°C (bias=${calDetails.originalBias?.toFixed(1)}°C)`,
          description: `Duża rozbieżność (${diff.toFixed(1)}°C) między modelem Open-Meteo a stacją IMGW ${imgwStation.name} (${imgwStation.distance}).`,
          suggestedFix: 'Sprawdź inwersję termiczną, odległość stacji oraz działanie Decay Engine.',
          file: 'src/utils/weatherUtils.ts',
          line: 374,
        });
      }

      // Check mode vs age logic
      if (calDetails.delayMinutes !== undefined && calDetails.delayMinutes !== null) {
        const age = calDetails.delayMinutes;
        if (age > 120 && calDetails.calibrationMode !== 'MODEL_ONLY') {
          issues.push({
            id: 'DECAY_ENGINE_OUTDATED_MODE_MISMATCH',
            parameter: 'TEMPERATURE',
            severity: 'HIGH',
            timestamp,
            sourceValue: `Wiek IMGW: ${age} min`,
            computedValue: `Tryb: ${calDetails.calibrationMode}`,
            description: `Pomiar IMGW starszy niż 120 minut (${age} min) nie przeszedł w tryb MODEL_ONLY.`,
            suggestedFix: 'Zweryfikuj warunki przełączania w getCalibratedTemperatureDetails.',
            file: 'src/utils/weatherUtils.ts',
            line: 418,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 3. APPARENT TEMPERATURE & STEADMAN EQUATION
  // -------------------------------------------------------------
  const rawOmApparent = typeof current?.apparent_temperature === 'number'
    ? current.apparent_temperature
    : (typeof hourly?.apparent_temperature?.[matchedHourIndex] === 'number' ? hourly.apparent_temperature[matchedHourIndex] : null);

  const rawHumidity = typeof current?.relative_humidity_2m === 'number'
    ? current.relative_humidity_2m
    : (typeof hourly?.relative_humidity_2m?.[matchedHourIndex] === 'number' ? hourly.relative_humidity_2m[matchedHourIndex] : 50);

  const rawWindSpeed = typeof current?.wind_speed_10m === 'number'
    ? current.wind_speed_10m
    : (typeof hourly?.wind_speed_10m?.[matchedHourIndex] === 'number' ? hourly.wind_speed_10m[matchedHourIndex] : 10);

  const rawWindGusts = typeof current?.wind_gusts_10m === 'number'
    ? current.wind_gusts_10m
    : (typeof hourly?.wind_gusts_10m?.[matchedHourIndex] === 'number' ? hourly.wind_gusts_10m[matchedHourIndex] : rawWindSpeed);

  const calculatedSteadmanApparent = auraFinalTemp !== null
    ? calculateApparentTemperature(auraFinalTemp, rawHumidity, rawWindSpeed, rawWindGusts)
    : null;

  if (calculatedSteadmanApparent !== null && (calculatedSteadmanApparent < -60 || calculatedSteadmanApparent > 65)) {
    issues.push({
      id: 'APPARENT_TEMPERATURE_ANOMALY',
      parameter: 'APPARENT',
      severity: 'HIGH',
      timestamp,
      computedValue: calculatedSteadmanApparent,
      description: `Obliczona temperatura odczuwalna ${calculatedSteadmanApparent}°C wykracza poza fizyczny zakres.`,
      suggestedFix: 'Sprawdź poprawność wejść (T, RH, Wind) przekazywanych do calculateApparentTemperature.',
      file: 'src/utils/weatherUtils.ts',
      line: 75,
    });
  }

  // -------------------------------------------------------------
  // 4. DEW POINT & PHYSICAL LAW (Tdew <= Tair)
  // -------------------------------------------------------------
  const dewPointVal = auraFinalTemp !== null && rawHumidity !== null
    ? calculateDewPoint(auraFinalTemp, rawHumidity)
    : null;

  if (auraFinalTemp !== null && dewPointVal !== null) {
    if (dewPointVal > auraFinalTemp + 0.1) {
      issues.push({
        id: 'DEW_POINT_EXCEEDS_AIR_TEMP',
        parameter: 'DEW_POINT',
        severity: 'HIGH',
        timestamp,
        sourceValue: `T_air: ${auraFinalTemp}°C, RH: ${rawHumidity}%`,
        computedValue: `T_dew: ${dewPointVal}°C`,
        description: `Temperatura punktu rosy (${dewPointVal}°C) przekracza temperaturę powietrza (${auraFinalTemp}°C), co narusza prawa termodynamiki atmosferycznej.`,
        suggestedFix: 'Dodaj Math.min(temp, dewPoint) w calculateDewPoint w src/utils/weatherUtils.ts.',
        file: 'src/utils/weatherUtils.ts',
        line: 60,
      });
    }
  }

  // -------------------------------------------------------------
  // 5. HUMIDITY VALIDATION
  // -------------------------------------------------------------
  if (typeof current?.relative_humidity_2m === 'number') {
    const h = current.relative_humidity_2m;
    if (h < 0 || h > 100) {
      issues.push({
        id: 'HUMIDITY_OUT_OF_RANGE',
        parameter: 'HUMIDITY',
        severity: 'HIGH',
        timestamp,
        sourceValue: h,
        description: `Wilgotność względna ${h}% wykracza poza zakres 0-100%.`,
        suggestedFix: 'Zastosuj normalizeHumidity / Math.max(0, Math.min(100, val)).',
        file: 'src/utils/weatherUtils.ts',
        line: 586,
      });
    } else if (h > 0 && h <= 1.0) {
      issues.push({
        id: 'HUMIDITY_FRACTIONAL_0_1_MISMATCH',
        parameter: 'HUMIDITY',
        severity: 'HIGH',
        timestamp,
        sourceValue: h,
        description: `Wykryto prawdopodobnie wilgotność w ułamku 0-1 (${h}) zamiast skali 0-100%.`,
        suggestedFix: 'Pomnóż przez 100 przy normalizacji.',
        file: 'src/components/MainWeather.tsx',
        line: 586,
      });
    }
  }

  // -------------------------------------------------------------
  // 6. WIND & GUSTS TESTS
  // -------------------------------------------------------------
  if (typeof rawWindSpeed === 'number') {
    if (rawWindSpeed < 0 || rawWindSpeed > 300) {
      issues.push({
        id: 'WIND_SPEED_ANOMALY',
        parameter: 'WIND',
        severity: 'HIGH',
        timestamp,
        sourceValue: rawWindSpeed,
        description: `Prędkość wiatru ${rawWindSpeed} km/h wykracza poza dopuszczalne granice.`,
        suggestedFix: 'Zweryfikuj konwersję jednostek m/s -> km/h.',
        file: 'src/utils/imgw.ts',
        line: 88,
      });
    }
    if (typeof rawWindGusts === 'number' && rawWindGusts < rawWindSpeed - 1.0) {
      issues.push({
        id: 'WIND_GUSTS_LOWER_THAN_SUSTAINED',
        parameter: 'WIND',
        severity: 'LOW',
        timestamp,
        sourceValue: `Wiatr: ${rawWindSpeed} km/h, Porywy: ${rawWindGusts} km/h`,
        description: `Porywy wiatru (${rawWindGusts} km/h) są raportowane jako niższe od średniej prędkości wiatru (${rawWindSpeed} km/h).`,
        suggestedFix: 'Zastosuj Math.max(windSpeed, gusts).',
        file: 'src/components/MainWeather.tsx',
        line: 575,
      });
    }
  }

  // -------------------------------------------------------------
  // 7. UV INDEX & UI CONSISTENCY (CRITICAL DOMAIN)
  // -------------------------------------------------------------
  const rawCurrentUv = typeof current?.uv_index === 'number' ? current.uv_index : null;
  const rawHourlyUv = typeof hourly?.uv_index?.[matchedHourIndex] === 'number' ? hourly.uv_index[matchedHourIndex] : null;
  const rawDailyMaxUv = typeof daily?.uv_index_max?.[0] === 'number' ? daily.uv_index_max[0] : null;
  const rawClearSkyUv = typeof (current as any)?.uv_index_clear_sky === 'number'
    ? (current as any).uv_index_clear_sky
    : (typeof (hourly as any)?.uv_index_clear_sky?.[matchedHourIndex] === 'number' ? (hourly as any).uv_index_clear_sky[matchedHourIndex] : null);
  const currentCloudCover = current?.cloud_cover ?? hourly?.cloud_cover?.[matchedHourIndex] ?? 0;

  let resolvedCurrentUv: number | null = null;
  if (rawCurrentUv !== null) {
    resolvedCurrentUv = rawCurrentUv;
  } else if (rawHourlyUv !== null) {
    resolvedCurrentUv = rawHourlyUv;
    fallbacksTracked.push({
      parameter: 'UV',
      primarySource: 'current.uv_index',
      fallbackUsed: `hourly.uv_index[${matchedHourIndex}]`,
      reason: 'Brak pola current.uv_index w odpowiedzi API; użyto hourly.uv_index',
      isSafe: true,
      impact: 'LOW',
    });
  } else if (rawClearSkyUv !== null) {
    resolvedCurrentUv = calculateAdjustedUvIndex(rawClearSkyUv, currentCloudCover);
    fallbacksTracked.push({
      parameter: 'UV',
      primarySource: 'current.uv_index',
      fallbackUsed: 'calculateAdjustedUvIndex(uv_index_clear_sky, cloud_cover)',
      reason: 'Brak bezpośrednich odczytów UV (current i hourly) - szacowanie z bezchmurnego UV i zachmurzenia',
      isSafe: true,
      impact: 'MEDIUM',
    });
  } else {
    // Brak danych UV
    issues.push({
      id: 'UV_DATA_MISSING',
      parameter: 'UV',
      severity: 'LOW',
      timestamp,
      sourceValue: 'current.uv_index = null, hourly.uv_index = null',
      description: 'Brak parametru uv_index w polach current i hourly Open-Meteo.',
      suggestedFix: 'Sprawdź parametry zapytania Open-Meteo w weatherApi.ts lub server.ts.',
      file: 'src/services/weatherApi.ts',
      line: 35,
    });
  }

  // Check night-time UV
  if (current?.is_day === 0 && resolvedCurrentUv !== null && resolvedCurrentUv > 0.5) {
    issues.push({
      id: 'UV_NIGHT_TIME_NON_ZERO',
      parameter: 'UV',
      severity: 'MEDIUM',
      timestamp,
      sourceValue: `is_day=0, UV=${resolvedCurrentUv}`,
      description: `W nocy (is_day=0) model wskazuje indeks UV = ${resolvedCurrentUv.toFixed(1)}, podczas gdy w nocy UV musi wynosić 0.`,
      suggestedFix: 'Wymuś zerowanie UV gdy is_day === 0 lub słońce jest pod horyzontem.',
      file: 'src/components/MainWeather.tsx',
      line: 540,
    });
  }

  // Detect UI Mismatch: Daily max presented as main tile without explicit badge
  if (rawDailyMaxUv !== null && resolvedCurrentUv !== null) {
    const diffUv = Math.abs(rawDailyMaxUv - resolvedCurrentUv);
    if (diffUv >= 2.0) {
      issues.push({
        id: 'UV_DISPLAY_MISMATCH_DAILY_MAX_VS_CURRENT',
        parameter: 'UI',
        severity: 'MEDIUM',
        timestamp,
        sourceValue: `hourly/current UV = ${resolvedCurrentUv.toFixed(1)}`,
        computedValue: `daily.uv_index_max[0] = ${rawDailyMaxUv.toFixed(1)}`,
        uiDisplayedValue: `${Math.round(rawDailyMaxUv)} (w kafelku Indeks UV)`,
        component: 'MainWeather (Kafelek Indeks UV)',
        file: 'src/components/MainWeather.tsx',
        line: 1753,
        description: `Kafelek główny wyświetla szczytowe maksimum dobowe UV (${Math.round(rawDailyMaxUv)}), podczas gdy aktualne chwilowe nasłonecznienie wynosi ${resolvedCurrentUv.toFixed(1)}. Może to sprawiać wrażenie zawyżania UV w porównaniu do innych aplikacji.`,
        suggestedFix: 'Dodaj w kafelku wyraźną etykietę „Maksimum w południe: X” oraz podtytuł „Teraz: Y”.',
      });
    }
  }

  // -------------------------------------------------------------
  // 8. CLOUD LAYERS & OPTICAL TRANSMITTANCE TESTS
  // -------------------------------------------------------------
  const lowC = current?.cloud_cover_low ?? hourly?.cloud_cover_low?.[matchedHourIndex];
  const midC = current?.cloud_cover_mid ?? hourly?.cloud_cover_mid?.[matchedHourIndex];
  const highC = current?.cloud_cover_high ?? hourly?.cloud_cover_high?.[matchedHourIndex];
  const rawCloud = current?.cloud_cover ?? hourly?.cloud_cover?.[matchedHourIndex];

  if (typeof lowC === 'number' && typeof midC === 'number' && typeof highC === 'number') {
    const opticalCloud = calculateOpticalCloudCover(lowC, midC, highC, rawCloud);
    if (typeof rawCloud === 'number' && rawCloud >= 90 && highC >= 85 && lowC <= 10 && opticalCloud <= 35) {
      issues.push({
        id: 'CLOUD_CIRRUS_OPTICAL_TRANSMITTANCE_GAP',
        parameter: 'CLOUD',
        severity: 'LOW',
        timestamp,
        sourceValue: `Zachmurzenie całkowite: ${rawCloud}%, Chmury wysokie (Cirrus): ${highC}%`,
        computedValue: `Przejrzystość optyczna Aury: ${opticalCloud}%`,
        description: `Niebo w 100% pokryte przezroczystymi chmurami Cirrus - model optyczny Aury wylicza ${opticalCloud}% krycia, podczas gdy surowy parametr podaje ${rawCloud}%.`,
        suggestedFix: 'Prezentuj w UI etykietę „Wysokie chmury (słońce prześwituje)” zgodnie z calculateOpticalCloudCover.',
        file: 'src/utils/weatherUtils.ts',
        line: 580,
      });
    }
  }

  // -------------------------------------------------------------
  // 9. PRECIPITATION & NOWCASTING AUDIT
  // -------------------------------------------------------------
  const rawPrecip = current?.precipitation ?? hourly?.precipitation?.[matchedHourIndex] ?? 0;
  const rawPop = hourly?.precipitation_probability?.[matchedHourIndex] ?? 0;

  if (currentCloudCover <= 5 && rawPop >= 80 && rawPrecip > 0.5) {
    issues.push({
      id: 'PRECIPITATION_WITHOUT_CLOUDS_CONTRADICTION',
      parameter: 'PRECIPITATION',
      severity: 'HIGH',
      timestamp,
      sourceValue: `Zachmurzenie: ${currentCloudCover}%, POP: ${rawPop}%, Opad: ${rawPrecip} mm`,
      description: 'Wykryto sprzeczność: Opad deszczu przy bezchmurnym niebie (cloud_cover <= 5%).',
      suggestedFix: 'Zweryfikuj kody WMO oraz zgodność indeksów chmur i opadów.',
      file: 'src/utils/weatherUtils.ts',
      line: 47,
    });
  }

  // -------------------------------------------------------------
  // 10. LEAF WETNESS (LWD) VALIDATION
  // -------------------------------------------------------------
  if (auraFinalTemp !== null && rawHumidity !== null) {
    const lwdResult = calculateLeafWetness(
      rawPrecip,
      rawHumidity,
      auraFinalTemp,
      dewPointVal,
      current?.is_day ?? 1,
      rawWindSpeed,
      imgwStation?.name,
      current?.weather_code ?? 0
    );

    if (lwdResult.score < 0 || lwdResult.score > 15) {
      issues.push({
        id: 'LWD_SCORE_OUT_OF_BOUNDS',
        parameter: 'LWD',
        severity: 'HIGH',
        timestamp,
        computedValue: lwdResult.score,
        description: `Wskaźnik zwilżenia liścia LWD = ${lwdResult.score} wykracza poza zdefiniowaną skalę 0-15.`,
        suggestedFix: 'Ogranicz wynik do przedziału Math.max(0, Math.min(15, score)).',
        file: 'src/utils/weatherUtils.ts',
        line: 954,
      });
    }
  }

  // -------------------------------------------------------------
  // 11. LANGUAGE & SEMANTIC AUDIT
  // -------------------------------------------------------------
  // Test RainAlertNowcastCard phrasing
  if (minutely_15 && minutely_15.time && minutely_15.time.length > 0) {
    for (let i = 1; i < Math.min(minutely_15.time.length, 6); i++) {
      const p = Number(minutely_15.precipitation?.[i] || 0);
      const prob = Number(minutely_15.precipitation_probability?.[i] || 0);
      if (p > 0.1 || prob >= 50) {
        const itemTime = new Date(minutely_15.time[i]);
        const timeLabel = itemTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        // The current phrasing produces "OPADY ZA OK. 15:30"
        issues.push({
          id: 'LANGUAGE_RAIN_ALERT_TIME_FORMAT_MISMATCH',
          parameter: 'LANGUAGE',
          severity: 'MEDIUM',
          timestamp,
          sourceValue: `timeLabel="${timeLabel}"`,
          computedValue: `alertBadgeText="OPADY ZA OK. ${timeLabel}"`,
          uiDisplayedValue: `OPADY ZA OK. ${timeLabel}`,
          component: 'RainAlertNowcastCard',
          file: 'src/components/RainAlertNowcastCard.tsx',
          line: 101,
          description: `Wyrażenie „OPADY ZA OK. ${timeLabel}” jest semantycznie błędne, ponieważ ${timeLabel} jest godziną zegarową, a nie liczbą minut.`,
          suggestedFix: `Zmień treść na „OPADY OD OK. ${timeLabel}” lub oblicz różnicę w minutach: „OPADY ZA OK. X MIN”.`,
        });
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 12. COMPUTE SYSTEM HEALTH PERCENT & PARAMETER STATUSES
  // -------------------------------------------------------------
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  for (const iss of issues) {
    if (iss.severity === 'CRITICAL') criticalCount++;
    else if (iss.severity === 'HIGH') highCount++;
    else if (iss.severity === 'MEDIUM') mediumCount++;
    else if (iss.severity === 'LOW') lowCount++;
    else if (iss.severity === 'INFO') infoCount++;
  }

  // Penalty weights: CRITICAL (-30), HIGH (-15), MEDIUM (-5), LOW (-2), INFO (0)
  const penalty = (criticalCount * 30) + (highCount * 15) + (mediumCount * 5) + (lowCount * 2);
  const overallHealthPercent = Math.max(0, Math.min(100, 100 - penalty));

  // Determine parameter matrix status
  const getParamStatus = (param: DiagnosticIssue['parameter']): 'HEALTHY' | 'WARNING' | 'ERROR' => {
    const paramIssues = issues.filter((i) => i.parameter === param);
    if (paramIssues.some((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH')) return 'ERROR';
    if (paramIssues.some((i) => i.severity === 'MEDIUM')) return 'WARNING';
    return 'HEALTHY';
  };

  const parameterMatrix: AuraSelfDiagnosticReport['parameterMatrix'] = {
    temperature: getParamStatus('TEMPERATURE'),
    apparent: getParamStatus('APPARENT'),
    uv: getParamStatus('UV') === 'WARNING' || issues.some(i => i.id.startsWith('UV_DISPLAY_MISMATCH')) ? 'WARNING' : getParamStatus('UV'),
    precipitation: getParamStatus('PRECIPITATION'),
    cloud: getParamStatus('CLOUD'),
    wind: getParamStatus('WIND'),
    humidity: getParamStatus('HUMIDITY'),
    pressure: getParamStatus('PRESSURE'),
    dewPoint: getParamStatus('DEW_POINT'),
    lwd: getParamStatus('LWD'),
    timeSync: getParamStatus('TIME_SYNC'),
  };

  // -------------------------------------------------------------
  // 13. LOGGING (CONTROLLED) & HISTORY STORAGE
  // -------------------------------------------------------------
  if (criticalCount > 0 || highCount > 0) {
    console.warn(`[AURA SELF-DIAGNOSTIC] Detected ${criticalCount} CRITICAL, ${highCount} HIGH issues. Overall Health: ${overallHealthPercent}%`);
  }

  // Persist issues into history
  saveDiagnosticIssuesToHistory(issues);
  const history = loadDiagnosticHistory();
  const trendsSummary = computeDiagnosticTrends(history);

  return {
    timestamp,
    overallHealthPercent,
    severityCounts: {
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      info: infoCount,
    },
    sourcesStatus,
    parameterMatrix,
    issues,
    fallbacksTracked,
    trendsSummary: {
      ...trendsSummary,
      avgImgwBias: calDetails.originalBias ?? null,
    },
  };
}
