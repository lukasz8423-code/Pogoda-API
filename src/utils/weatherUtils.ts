import { 
  Sun, 
  Moon,
  CloudSun, 
  CloudMoon,
  Cloud, 
  CloudFog, 
  CloudDrizzle, 
  CloudRain, 
  CloudSnow, 
  Snowflake, 
  CloudHail, 
  CloudLightning,
  type LucideIcon 
} from "lucide-react";

export interface WeatherMeta {
  text: string;
  icon: LucideIcon;
  emoji: string;
  gradientClass: string; // Tailwind background gradient matching the mood
  isDarkTheme: boolean;  // True if background is dark, requiring light text
  code: number;          // Effective weather code after satellite/precipitation validation
}

export function getCityLocationString(city: string): string {
  if (!city) return "Twoja lokalizacja";
  let cleaned = city.trim();
  
  // Strip out verbose administrative parentheticals e.g. "(województwo kujawsko-pomorskie)", "(powiat lipnowski)", "(woj. ...)"
  cleaned = cleaned.replace(/\s*\((województwo|powiat|Rzeczpospolita|Polska|woj\.|gm\.|gmina|Kujawsko-Pomorskie)[^)]*\)/gi, '');
  
  // If city is comma-separated e.g. "Lipno, województwo kujawsko-pomorskie", take the primary locality before comma
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts[0] && parts[0].trim().length > 0) {
      cleaned = parts[0].trim();
    }
  }

  // Strip empty parentheses
  cleaned = cleaned.replace(/\s*\(\s*\)/g, '').trim();
  
  return cleaned || city.trim();
}

export function sanitizeHourCode(rawCode: number, pop: number, precip: number, cloudCover: number): number {
  // Respect raw Open-Meteo WMO weather code without artificial modification
  return typeof rawCode === "number" ? rawCode : 0;
}

export function calculateDewPoint(temp: number | null | undefined, humidity: number | null | undefined): number | null {
  if (temp === null || temp === undefined || humidity === null || humidity === undefined || isNaN(temp) || isNaN(humidity)) {
    return null;
  }
  if (humidity <= 0 || humidity > 100) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}

/**
 * Calculates apparent (feels-like) temperature compliant with IMGW-PIB / Steadman / Wind Chill standard:
 * 1. Niskie temperatury (T <= 10°C, wiatr >= 4.8 km/h): Wskaźnik Wind Chill JAGTI (Osczevski-Bluestein / IMGW).
 * 2. Temperatury powyżej 10°C (T > 10°C): Model Steadmana (Australian BOM / IMGW biomet):
 *    AT = T + 0.33 * e - 0.70 * v - 4.00
 *    gdzie:
 *    - e = ciśnienie cząstkowe pary wodnej (hPa) wg wzoru Tetensa/Magnusa
 *    - v = prędkość wiatru w m/s (z uwzględnieniem porywów wiatru)
 *    - przy wietrze > 15 km/h dynamicznie i silnie zbija temperaturę o 2-4°C (zgodnie ze stacjami IMGW).
 * 3. Zaokrąglenie do 1 miejsca po przecinku.
 */
export function calculateApparentTemperature(
  temp: number | null | undefined,
  humidity: number | null | undefined,
  windSpeedKmH: number | null | undefined,
  windGustsKmH?: number | null | undefined
): number | null {
  if (temp === null || temp === undefined || isNaN(temp)) return null;
  const rh = (humidity !== null && humidity !== undefined && !isNaN(humidity)) ? Math.max(0, Math.min(100, humidity)) : 50;
  const ws = (windSpeedKmH !== null && windSpeedKmH !== undefined && !isNaN(windSpeedKmH)) ? Math.max(0, windSpeedKmH) : 0;
  const gusts = (windGustsKmH !== null && windGustsKmH !== undefined && !isNaN(windGustsKmH)) ? Math.max(ws, windGustsKmH) : ws;

  // 1. ZIMNO: Wind Chill (Wychładzanie wiatrem wg wzoru Osczevski-Bluestein / JAGTI IMGW)
  // Stosowany przy niskich temperaturach (T <= 10°C) i odczuwalnym wietrze (ws >= 4.8 km/h)
  if (temp <= 10 && ws >= 4.8) {
    const effectiveWs = ws > 15 && gusts > ws ? (ws * 0.75 + gusts * 0.25) : ws;
    const vPow = Math.pow(effectiveWs, 0.16);
    const wc = 13.12 + (0.6215 * temp) - (11.37 * vPow) + (0.3965 * temp * vPow);
    return Number(wc.toFixed(1));
  }

  // 2. MODEL STEADMANA / BOM / IMGW DLA T > 10°C:
  // Ciśnienie cząstkowe pary wodnej (hPa) wg równania Tetensa / Magnusa
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
  
  // Efektywna prędkość wiatru w m/s (z uwzględnieniem dynamiki porywów przy silniejszym wietrze)
  let effectiveWs = ws;
  if (ws > 15 && gusts > ws) {
    // Porywy wiatru powyżej 15 km/h dynamicznie wzmacniają odczucie chłodu
    effectiveWs = ws * 0.7 + gusts * 0.3;
  }
  const v = effectiveWs / 3.6; // m/s

  // Standardowy model Steadmana dla otwartej przestrzeni / cienia:
  // AT = T + 0.33 * e - 0.70 * v - 4.00
  const apparent = temp + (0.33 * e) - (0.70 * v) - 4.00;

  return Number(apparent.toFixed(1));
}

/**
 * Format measurement time from IMGW (e.g. "2026-08-28 12:00:00" -> "12:00", "12" -> "12:00")
 */
export function formatMeasurementHour(measurementTime: string | null | undefined): string {
  if (!measurementTime) return "";
  const str = String(measurementTime).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, '0');
    const mm = timeMatch[2];
    return `${hh}:${mm}`;
  }
  const hourMatch = str.match(/\b(\d{1,2})\b/);
  if (hourMatch) {
    return `${hourMatch[1].padStart(2, '0')}:00`;
  }
  return str;
}

/**
 * Calculates the expected next synchronization time from the last measurement timestamp.
 * Expected update is always set to next hour at minute :25 (e.g., 12:10 -> 13:25, 12:00 -> 13:25).
 */
export function getExpectedNextUpdateTime(measurementTime: string | null | undefined): { nextUpdateStr: string; isPastExpectedTime: boolean } {
  if (!measurementTime) return { nextUpdateStr: "", isPastExpectedTime: false };
  const str = String(measurementTime).trim();
  let measH: number | null = null;

  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    measH = parseInt(timeMatch[1], 10);
  } else {
    const hourMatch = str.match(/\b(\d{1,2})\b/);
    if (hourMatch) {
      measH = parseInt(hourMatch[1], 10);
    }
  }

  if (measH === null || isNaN(measH)) {
    return { nextUpdateStr: "", isPastExpectedTime: false };
  }

  const nextH = (measH + 1) % 24;
  const nextUpdateStr = `${String(nextH).padStart(2, '0')}:25`;

  // Sprawdzamy czy obecny czas minął już przewidywane :25
  const now = new Date();
  const currentMinutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  
  // Obliczamy minuty od północy dla ostatniego pomiaru oraz oczekiwanej godziny pomiaru (nextH:25)
  const measMinutesFromMidnight = measH * 60;
  let expectedMinutesFromMidnight = nextH * 60 + 25;
  if (nextH === 0 && measH === 23) {
    expectedMinutesFromMidnight = 24 * 60 + 25;
  }

  // Jeśli obecny czas przekroczył expectedMinutesFromMidnight (lub minęło > 85 minut od pomiaru)
  let isPastExpectedTime = false;
  if (measMinutesFromMidnight <= expectedMinutesFromMidnight) {
    if (currentMinutesFromMidnight > expectedMinutesFromMidnight && currentMinutesFromMidnight - expectedMinutesFromMidnight < 12 * 60) {
      isPastExpectedTime = true;
    }
  } else {
    // przejście przez północ
    if (currentMinutesFromMidnight < 12 * 60 && (currentMinutesFromMidnight + 24 * 60) > expectedMinutesFromMidnight) {
      isPastExpectedTime = true;
    }
  }

  return { nextUpdateStr, isPastExpectedTime };
}

/**
 * Finds Open-Meteo hourly temperature matching the IMGW measurement hour.
 */
export function findMatchingHourlyTemp(
  measurementTime: string | null | undefined,
  hourlyTimes: string[] | null | undefined,
  hourlyTemps: number[] | null | undefined,
  fallbackTemp: number | null | undefined
): number | null {
  if (!hourlyTimes || !hourlyTemps || hourlyTimes.length === 0 || hourlyTemps.length === 0) {
    return typeof fallbackTemp === 'number' && !isNaN(fallbackTemp) ? fallbackTemp : null;
  }

  if (measurementTime) {
    const str = String(measurementTime).trim();
    // Try to extract date and hour: e.g. "2026-08-28 12" or "2026-08-28T12"
    const isoMatch = str.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2})/);
    if (isoMatch) {
      const prefix = `${isoMatch[1]}T${isoMatch[2]}`;
      const idx = hourlyTimes.findIndex(t => t.startsWith(prefix));
      if (idx >= 0 && typeof hourlyTemps[idx] === 'number' && !isNaN(hourlyTemps[idx])) {
        return hourlyTemps[idx];
      }
    }

    // Try matching hour of day e.g. "12:00"
    const hourMatch = str.match(/(\d{1,2}):(\d{2})/);
    if (hourMatch) {
      const hh = hourMatch[1].padStart(2, '0');
      const nowIso = new Date().toISOString().slice(0, 10);
      const targetPrefix = `${nowIso}T${hh}`;
      let idx = hourlyTimes.findIndex(t => t.startsWith(targetPrefix));
      if (idx < 0) {
        idx = hourlyTimes.findIndex(t => t.includes(`T${hh}:`));
      }
      if (idx >= 0 && typeof hourlyTemps[idx] === 'number' && !isNaN(hourlyTemps[idx])) {
        return hourlyTemps[idx];
      }
    }
  }

  // Fallback to current hour index or first available
  const nowHour = new Date().getHours();
  const nowPrefix = `T${String(nowHour).padStart(2, '0')}:`;
  const currIdx = hourlyTimes.findIndex(t => t.includes(nowPrefix));
  if (currIdx >= 0 && typeof hourlyTemps[currIdx] === 'number' && !isNaN(hourlyTemps[currIdx])) {
    return hourlyTemps[currIdx];
  }

  return typeof fallbackTemp === 'number' && !isNaN(fallbackTemp) ? fallbackTemp : (hourlyTemps[0] ?? null);
}

export interface CalibratedTemperatureDetails {
  calibratedTemp: number | null;
  bias: number;
  openMeteoTempAtMeasurement: number | null;
  measurementHourStr: string | null;
  expectedNextUpdateStr?: string | null;
  isCalibrated: boolean;
  isDelayed: boolean;
  delayMinutes: number;
  stationName: string | null;
  statusLabel: string;
}

/**
 * Checks if measurement is older than 30 minutes from current system time.
 */
export function checkImgwDelay(measurementTime: string | null | undefined): { isDelayed: boolean; minutesOld: number } {
  if (!measurementTime) return { isDelayed: false, minutesOld: 0 };
  try {
    const str = String(measurementTime).trim();
    let measDate: Date | null = null;

    // Format ISO: 2026-08-28 12:00:00 or 2026-08-28T12:00:00
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      measDate = new Date(str.replace(' ', 'T'));
    } else {
      // Format "12:00" or "12:10" or "12:10 CEST" -> construct today Date
      const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        measDate = new Date();
        measDate.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      } else {
        const hourMatch = str.match(/\b(\d{1,2})\b/);
        if (hourMatch) {
          measDate = new Date();
          measDate.setHours(parseInt(hourMatch[1], 10), 0, 0, 0);
        }
      }
    }

    if (measDate && !isNaN(measDate.getTime())) {
      const now = Date.now();
      // If time parsed without date is ahead of current time by > 15 minutes, it belongs to yesterday
      if (measDate.getTime() > now + 15 * 60 * 1000 && !/^\d{4}-\d{2}-\d{2}/.test(str)) {
        measDate.setDate(measDate.getDate() - 1);
      }
      const diffMs = now - measDate.getTime();
      const minutesOld = Math.round(diffMs / (60 * 1000));
      // If older than 30 minutes (> 30 min)
      if (minutesOld > 30) {
        return { isDelayed: true, minutesOld };
      }
      return { isDelayed: false, minutesOld: Math.max(0, minutesOld) };
    }
  } catch (e) {
    // fallback
  }
  return { isDelayed: false, minutesOld: 0 };
}

/**
 * Dynamic Calibration & Bias Correction:
 * 1. Oblicza stałą odchyłkę: Bias = (Temp IMGW) - (Temp Open-Meteo z godziny pomiaru IMGW)
 * 2. Dodaje wyliczony Bias do bieżącej temperatury Open-Meteo dla obecnej minuty/godziny na żywo
 * 3. Zwraca skalibrowaną temperaturę zaokrągloną do 1 miejsca po przecinku
 *    Gdy odczyt IMGW jest starszy niż 30 minut, aplikacja płynnie dodaje bias do bieżącego modelu Open-Meteo
 *    i oznacza status jako "Oczekuje na aktualizację".
 */
export function getCalibratedTemperatureDetails(
  imgwStationOrTemp: { temp?: number | null; measurementTime?: string | null; lastSync?: string | null; stationName?: string | null; name?: string | null; distanceKm?: number } | number | null | undefined,
  measurementTimeOrCurrentTemp?: string | number | null,
  currentOpenMeteoTempOrHourlyTimes?: number | string[] | null,
  hourlyTimesOrTemps?: string[] | number[] | null,
  hourlyTempsArg?: number[] | null
): CalibratedTemperatureDetails {
  let imgwTemp: number | null = null;
  let measurementTime: string | null = null;
  let stationName: string | null = null;
  let currentOpenMeteoTemp: number | null = null;
  let hourlyTimes: string[] | null = null;
  let hourlyTemps: number[] | null = null;

  if (typeof imgwStationOrTemp === 'object' && imgwStationOrTemp !== null) {
    imgwTemp = typeof imgwStationOrTemp.temp === 'number' && !isNaN(imgwStationOrTemp.temp) ? imgwStationOrTemp.temp : null;
    measurementTime = imgwStationOrTemp.measurementTime || imgwStationOrTemp.lastSync || null;
    stationName = imgwStationOrTemp.stationName || imgwStationOrTemp.name || null;
    currentOpenMeteoTemp = typeof measurementTimeOrCurrentTemp === 'number' ? measurementTimeOrCurrentTemp : null;
    hourlyTimes = Array.isArray(currentOpenMeteoTempOrHourlyTimes) ? currentOpenMeteoTempOrHourlyTimes : null;
    hourlyTemps = Array.isArray(hourlyTimesOrTemps) ? (hourlyTimesOrTemps as number[]) : null;
  } else {
    imgwTemp = typeof imgwStationOrTemp === 'number' && !isNaN(imgwStationOrTemp) ? imgwStationOrTemp : null;
    measurementTime = typeof measurementTimeOrCurrentTemp === 'string' ? measurementTimeOrCurrentTemp : null;
    currentOpenMeteoTemp = typeof currentOpenMeteoTempOrHourlyTimes === 'number' ? currentOpenMeteoTempOrHourlyTimes : null;
    hourlyTimes = Array.isArray(hourlyTimesOrTemps) ? (hourlyTimesOrTemps as string[]) : null;
    hourlyTemps = Array.isArray(hourlyTempsArg) ? hourlyTempsArg : null;
  }

  const rawOm = typeof currentOpenMeteoTemp === 'number' && !isNaN(currentOpenMeteoTemp) ? currentOpenMeteoTemp : null;
  const hourStr = formatMeasurementHour(measurementTime);
  const delayCheck = checkImgwDelay(measurementTime);

  // Fallback if IMGW reading is missing
  if (imgwTemp === null) {
    return {
      calibratedTemp: rawOm !== null ? Number(rawOm.toFixed(1)) : null,
      bias: 0,
      openMeteoTempAtMeasurement: null,
      measurementHourStr: null,
      isCalibrated: false,
      isDelayed: false,
      delayMinutes: 0,
      stationName: null,
      statusLabel: "Model Open-Meteo (Best Match)"
    };
  }

  // Find Open-Meteo temp at the time of IMGW measurement
  const omAtMeasurement = findMatchingHourlyTemp(measurementTime, hourlyTimes, hourlyTemps, rawOm);

  // Obliczenie odchyłki (bias) między pomiarem stacji a modelem z tamtej godziny
  const rawModelBias = omAtMeasurement !== null ? (imgwTemp - omAtMeasurement) : 0;

  const { nextUpdateStr, isPastExpectedTime } = getExpectedNextUpdateTime(measurementTime);

  // 1. Świeży odczyt (<= 30 min):
  // Temperatura na ekranie to DOKŁADNIE odczyt ze stacji IMGW (ground truth)
  if (!delayCheck.isDelayed) {
    const label = hourStr 
      ? (nextUpdateStr 
          ? `Skalibrowano ze stacją IMGW (Odczyt z ${hourStr} • kolejny ~${nextUpdateStr})`
          : `Skalibrowano ze stacją IMGW (Odczyt z ${hourStr})`)
      : (nextUpdateStr 
          ? `Skalibrowano ze stacją IMGW (kolejny ~${nextUpdateStr})`
          : "Skalibrowano ze stacją IMGW");

    return {
      calibratedTemp: Number(imgwTemp.toFixed(1)),
      bias: 0,
      openMeteoTempAtMeasurement: omAtMeasurement !== null ? Number(omAtMeasurement.toFixed(1)) : null,
      measurementHourStr: hourStr || null,
      expectedNextUpdateStr: nextUpdateStr || null,
      isCalibrated: true,
      isDelayed: false,
      delayMinutes: delayCheck.minutesOld,
      stationName,
      statusLabel: label
    };
  }

  // 2. Opóźnienie stacji (> 30 min):
  // Zamiast dodawać stały bias do dynamicznego modelu, stosujemy łagodne tłumienie (damping):
  // temperatura wyjściowa ze stacji IMGW odchyla się maksymalnie o +/- 0.3°C w stronę trendu Open-Meteo
  const omTrend = (rawOm !== null && omAtMeasurement !== null)
    ? (rawOm - omAtMeasurement)
    : (rawOm !== null ? (rawOm - imgwTemp) : 0);

  // Damping: 30% trendu z Open-Meteo, z twardym limitem +/- 0.3°C od ostatniego odczytu stacji
  const dampedShift = Math.max(-0.3, Math.min(0.3, omTrend * 0.3));
  const dampedTemp = imgwTemp + dampedShift;

  let delayStatusLabel: string;
  if (isPastExpectedTime) {
    delayStatusLabel = hourStr
      ? `Stacja IMGW: Odczyt z ${hourStr} (opóźnienie serwera API • ponawianie...)`
      : "Stacja IMGW (opóźnienie serwera API • ponawianie...)";
  } else {
    delayStatusLabel = hourStr
      ? `Stacja IMGW: Odczyt z ${hourStr} (spodziewany odczyt ~${nextUpdateStr})`
      : (nextUpdateStr ? `Stacja IMGW (spodziewany odczyt ~${nextUpdateStr})` : "Stacja IMGW (Oczekuje na aktualizację)");
  }
  
  return {
    calibratedTemp: Number(dampedTemp.toFixed(1)),
    bias: Number(dampedShift.toFixed(2)),
    openMeteoTempAtMeasurement: omAtMeasurement !== null ? Number(omAtMeasurement.toFixed(1)) : null,
    measurementHourStr: hourStr || null,
    expectedNextUpdateStr: nextUpdateStr || null,
    isCalibrated: true,
    isDelayed: true,
    delayMinutes: delayCheck.minutesOld,
    stationName,
    statusLabel: delayStatusLabel
  };
}

/**
 * Returns calibrated temperature rounded to 1 decimal place with safe fallback to raw model.
 */
export function getCalibratedTemperature(
  imgwStationOrTemp: { temp?: number | null; measurementTime?: string | null; lastSync?: string | null; stationName?: string | null; name?: string | null; distanceKm?: number } | number | null | undefined,
  measurementTimeOrCurrentTemp?: string | number | null,
  currentOpenMeteoTempOrHourlyTimes?: number | string[] | null,
  hourlyTimesOrTemps?: string[] | number[] | null,
  hourlyTempsArg?: number[] | null
): number | null {
  const details = getCalibratedTemperatureDetails(
    imgwStationOrTemp,
    measurementTimeOrCurrentTemp,
    currentOpenMeteoTempOrHourlyTimes,
    hourlyTimesOrTemps,
    hourlyTempsArg
  );
  return details.calibratedTemp;
}

export function getCloudCoverLabel(cloudCover: number): string {
  if (cloudCover <= 5) return "Bezchmurnie";
  if (cloudCover <= 30) return "Małe zachmurzenie";
  if (cloudCover <= 70) return "Umiarkowane zachmurzenie";
  if (cloudCover <= 95) return "Duże zachmurzenie";
  return "Pochmurno";
}

export interface CloudLayersData {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  total?: number | null;
}

/**
 * Maps WMO weather code to readable description, icon, emoji and metadata
 * with priority for optical cloud cover and real ground visibility
 */
export function getWeatherMeta(
  code: number, 
  isDay: boolean = true, 
  cloudCover?: number, 
  precipitation?: number,
  shortwaveRadiation?: number,
  userOverrideCode?: number,
  cloudLayers?: CloudLayersData | number
): WeatherMeta {
  let effectiveCode = typeof code === "number" ? code : 0;

  // Resolve optical cloud cover from layers if available
  let optCloud: number;
  let hasLayerData = false;
  let lowC = 0;
  let midC = 0;
  let highC = 0;

  if (cloudLayers && typeof cloudLayers === "object") {
    lowC = typeof cloudLayers.low === "number" && !isNaN(cloudLayers.low) ? cloudLayers.low : 0;
    midC = typeof cloudLayers.mid === "number" && !isNaN(cloudLayers.mid) ? cloudLayers.mid : 0;
    highC = typeof cloudLayers.high === "number" && !isNaN(cloudLayers.high) ? cloudLayers.high : 0;
    hasLayerData = true;
    optCloud = calculateOpticalCloudCover(lowC, midC, highC, typeof cloudCover === "number" ? cloudCover : cloudLayers.total);
  } else if (typeof cloudCover === "number" && !isNaN(cloudCover)) {
    optCloud = Math.min(100, Math.max(0, Math.round(cloudCover)));
  } else {
    optCloud = 0;
  }

  // Manual user observation override ("Widok z okna / Korekta lokalna")
  if (typeof userOverrideCode === "number" && !isNaN(userOverrideCode)) {
    effectiveCode = userOverrideCode;
  } else {
    // Check for sunshower condition (active rain while sun is shining and clouds are broken)
    const isSunshower = (typeof precipitation === "number" && precipitation > 0.1) && isDay && (optCloud <= 65);

    if (isSunshower) {
      const isHeavy = precipitation > 2.5;
      return {
        text: isHeavy ? "Intensywny deszcz ze słońcem 🌈" : "Słoneczny deszcz (Przelotny opad) 🌦️",
        icon: CloudSun,
        emoji: "🌦️",
        gradientClass: "from-slate-950 via-slate-900 to-amber-950/30",
        isDarkTheme: true,
        code: isHeavy ? 65 : 80
      };
    }

    const isZeroPrecip = typeof precipitation === "number" ? precipitation <= 0.05 : true;
    const isDrizzleOrRainCode = (effectiveCode >= 50 && effectiveCode <= 67) || (effectiveCode >= 80 && effectiveCode <= 82) || (effectiveCode >= 95 && effectiveCode <= 99);
    const hasBrightSunlight = typeof shortwaveRadiation === "number" && shortwaveRadiation > 50;

    // SATELLITE & GROUND SOLAR RADIATION VALIDATION:
    // If there is no real rain (<= 0.05 mm) OR bright solar radiation (>50 W/m²) is reaching the ground (satellite optics),
    // override false "drizzle/rain" model codes with true ground visual cloud state!
    if ((isZeroPrecip || hasBrightSunlight) && isDrizzleOrRainCode) {
      if (hasBrightSunlight && optCloud < 50) {
        effectiveCode = optCloud < 15 ? 0 : 1; // Słońce / Bezchmurnie lub Małe zachmurzenie
      } else if (optCloud < 15) {
        effectiveCode = 0;
      } else if (optCloud <= 45) {
        effectiveCode = 1;
      } else if (optCloud <= 75) {
        effectiveCode = 2;
      } else {
        effectiveCode = 3;
      }
    } else if (typeof precipitation === "number" && precipitation > 0.05) {
      // If active precipitation is measured (>0.05 mm), synchronize weather code with real-time measured rainfall intensity
      const isRainOrCloudCode = (effectiveCode >= 50 && effectiveCode <= 67) || (effectiveCode >= 80 && effectiveCode <= 82) || (effectiveCode >= 95 && effectiveCode <= 99) || effectiveCode <= 3;
      if (isRainOrCloudCode) {
        if (precipitation >= 2.5) {
          effectiveCode = 65; // Heavy rain / Ulewny deszcz
        } else if (precipitation >= 0.8) {
          effectiveCode = 63; // Moderate rain / Umiarkowany deszcz
        } else if (effectiveCode <= 3) {
          effectiveCode = 61; // Slight rain / Słaby deszcz
        }
      }
    } else if (effectiveCode <= 3) {
      // NON-PRECIPITATING (0-3): Derive true visual weather state from OPTICAL cloud cover:
      // High clouds (Cirrus) have high optical transmittance (~85% light passes through), so 100% Cirrus with 0% low/mid is sunny!
      if (hasLayerData && lowC <= 10 && midC <= 10) {
        if (highC >= 30) {
          return {
            text: isDay ? "Słonecznie (chmury pierzaste)" : "Przejaśnienia (chmury wysokie)",
            icon: isDay ? CloudSun : CloudMoon,
            emoji: isDay ? "🌤️" : "🌙",
            gradientClass: "from-slate-950 via-zinc-900 to-indigo-950/20",
            isDarkTheme: true,
            code: 1
          };
        } else {
          effectiveCode = 0;
        }
      } else if (optCloud < 15) {
        effectiveCode = 0;
      } else if (optCloud <= 40) {
        effectiveCode = 1;
      } else if (optCloud <= 75) {
        effectiveCode = 2;
      } else if (optCloud <= 85) {
        effectiveCode = 2;
      } else {
        effectiveCode = 3;
      }
    }
  }

  const baseMeta = (() => {
    switch (effectiveCode) {
      case 0: // Clear sky
        return {
          text: "Bezchmurnie",
          icon: isDay ? Sun : Moon,
          emoji: isDay ? "☀️" : "🌙",
          gradientClass: "from-slate-950 via-slate-900 to-amber-950/20",
          isDarkTheme: true
        };
      case 1: // Mainly clear
        return {
          text: "Małe zachmurzenie",
          icon: isDay ? CloudSun : CloudMoon,
          emoji: isDay ? "🌤️" : "🌙",
          gradientClass: "from-slate-950 via-zinc-900 to-indigo-950/20",
          isDarkTheme: true
        };
      case 2: // Partly cloudy
        return {
          text: "Umiarkowane zachmurzenie",
          icon: isDay ? CloudSun : CloudMoon,
          emoji: "⛅",
          gradientClass: "from-slate-950 via-slate-900 to-zinc-900",
          isDarkTheme: true
        };
      case 3: // Overcast
        return {
          text: "Pochmurno",
          icon: Cloud,
          emoji: "☁️",
          gradientClass: "from-zinc-950 via-slate-900 to-slate-950",
          isDarkTheme: true
        };
      case 45: // Fog
      case 48: // Depositing rime fog
        return {
          text: "Mgła",
          icon: CloudFog,
          emoji: "🌫️",
          gradientClass: "from-slate-950 via-slate-900 to-zinc-800/40",
          isDarkTheme: true
        };
      case 51: // Light drizzle
      case 53: // Moderate drizzle
      case 55: // Dense drizzle
        return {
          text: "Mżawka",
          icon: CloudDrizzle,
          emoji: "🌦️",
          gradientClass: "from-slate-950 via-slate-900 to-cyan-950/20",
          isDarkTheme: true
        };
      case 56: // Light freezing drizzle
      case 57: // Dense freezing drizzle
        return {
          text: "Zamarzająca mżawka",
          icon: CloudSnow,
          emoji: "🌨️",
          gradientClass: "from-slate-950 via-zinc-900 to-blue-950/20",
          isDarkTheme: true
        };
      case 61: // Slight rain
        return {
          text: "Słaby deszcz",
          icon: CloudRain,
          emoji: "🌧️",
          gradientClass: "from-slate-950 via-slate-900 to-blue-950/40",
          isDarkTheme: true
        };
      case 63: // Moderate rain
        return {
          text: "Umiarkowany deszcz",
          icon: CloudRain,
          emoji: "🌧️",
          gradientClass: "from-slate-950 via-slate-900 to-blue-950/40",
          isDarkTheme: true
        };
      case 65: // Heavy rain
        return {
          text: "Ulewny deszcz",
          icon: CloudRain,
          emoji: "🌧️",
          gradientClass: "from-slate-950 via-slate-900 to-blue-950/40",
          isDarkTheme: true
        };
      case 66: // Light freezing rain
      case 67: // Heavy freezing rain
        return {
          text: "Zamarzający deszcz",
          icon: CloudSnow,
          emoji: "🌨️",
          gradientClass: "from-slate-950 via-zinc-950 to-blue-900/30",
          isDarkTheme: true
        };
      case 71: // Slight snow fall
        return {
          text: "Słaby śnieg",
          icon: Snowflake,
          emoji: "❄️",
          gradientClass: "from-slate-950 via-slate-900 to-sky-950/20",
          isDarkTheme: true
        };
      case 73: // Moderate snow fall
        return {
          text: "Umiarkowany śnieg",
          icon: Snowflake,
          emoji: "❄️",
          gradientClass: "from-slate-950 via-slate-900 to-sky-950/20",
          isDarkTheme: true
        };
      case 75: // Heavy snow fall
        return {
          text: "Ulewny śnieg",
          icon: Snowflake,
          emoji: "❄️",
          gradientClass: "from-slate-950 via-slate-900 to-sky-950/20",
          isDarkTheme: true
        };
      case 77: // Snow grains
        return {
          text: "Krupa śnieżna",
          icon: Snowflake,
          emoji: "❄️",
          gradientClass: "from-slate-950 via-slate-900 to-slate-800/30",
          isDarkTheme: true
        };
      case 80: // Slight rain showers
      case 81: // Moderate rain showers
      case 82: // Violent rain showers
        return {
          text: "Przelotny deszcz",
          icon: CloudHail,
          emoji: "🌦️",
          gradientClass: "from-slate-950 via-indigo-950/30 to-blue-950/30",
          isDarkTheme: true
        };
      case 85: // Slight snow showers
      case 86: // Heavy snow showers
        return {
          text: "Przelotny śnieg",
          icon: CloudSnow,
          emoji: "🌨️",
          gradientClass: "from-slate-950 via-slate-900 to-cyan-900/10",
          isDarkTheme: true
        };
      case 95: // Thunderstorm
        return {
          text: "Burza z piorunami",
          icon: CloudLightning,
          emoji: "⛈️",
          gradientClass: "from-slate-950 via-purple-950/40 to-slate-900",
          isDarkTheme: true
        };
      case 96: // Thunderstorm with slight hail
      case 99: // Thunderstorm with heavy hail
        return {
          text: "Burza z gradem",
          icon: CloudLightning,
          emoji: "⛈️",
          gradientClass: "from-slate-950 via-indigo-950/40 to-zinc-900",
          isDarkTheme: true
        };
      default:
        return {
          text: "Zachmurzenie",
          icon: Cloud,
          emoji: "☁️",
          gradientClass: "from-slate-950 via-slate-900 to-zinc-900",
          isDarkTheme: true
        };
    }
  })();

  return {
    ...baseMeta,
    code: effectiveCode
  };
}

export function getWeatherDescription(code: number, isDay: boolean = true, cloudCover?: number): string {
  return getWeatherMeta(code, isDay, cloudCover).text;
}

export function getWeatherEmoji(code: number, isDay: boolean = true, cloudCover?: number): string {
  return getWeatherMeta(code, isDay, cloudCover).emoji;
}

export function formatDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr);
  const weekdays = [
    "Niedziela",
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota"
  ];
  
  // Check if it's today
  const today = new Date();
  if (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  ) {
    return "Dzisiaj";
  }
  
  return weekdays[date.getDay()];
}

export function formatDayShort(dateStr: string): string {
  const date = new Date(dateStr);
  const weekdaysShort = ["Ndz", "Pon", "Wto", "Śro", "Czw", "Pią", "Sob"];
  return weekdaysShort[date.getDay()];
}

export function getWindDirection(deg: number): string {
  if (deg >= 337.5 || deg < 22.5) return "Pn";
  if (deg >= 22.5 && deg < 67.5) return "Pn-Wsch";
  if (deg >= 67.5 && deg < 112.5) return "Wsch";
  if (deg >= 112.5 && deg < 157.5) return "Pd-Wsch";
  if (deg >= 157.5 && deg < 202.5) return "Pd";
  if (deg >= 202.5 && deg < 247.5) return "Pd-Zach";
  if (deg >= 247.5 && deg < 292.5) return "Zach";
  if (deg >= 292.5 && deg < 337.5) return "Pn-Zach";
  return "";
}

export function getUvIndexDescription(uv: number): string {
  const rounded = Math.round(uv);
  if (rounded <= 2) return "Niskie";
  if (rounded <= 5) return "Umiarkowane";
  if (rounded <= 7) return "Wysokie";
  if (rounded <= 10) return "Bardzo wysokie";
  return "Ekstremalne";
}

/**
 * Calculates a cloud-corrected UV index based on the clear-sky UV index and cloud cover percentage.
 * Open-Meteo typically provides clear-sky UV index which needs adjustment for realistic local conditions.
 * Heuristic based on common meteorological reduction factors.
 */
export function calculateAdjustedUvIndex(clearSkyUv: number, cloudCover: number): number {
  const cloudFactor = cloudCover / 100;
  
  // Reduction factor formula: 1 - 0.3 * (clouds^2)
  const reduction = 1 - (0.3 * Math.pow(cloudFactor, 2));
  
  const adjusted = clearSkyUv * Math.max(0.6, reduction);
  return adjusted;
}

export interface StormStatusResult {
  isStorm: boolean;
  isStormRisk: boolean;
  level: "none" | "risk" | "active";
  title: string;
  message: string;
  lightningPotential: number;
}

export function checkStormStatus(
  current?: any,
  hourly?: any
): StormStatusResult {
  if (!current) {
    return {
      isStorm: false,
      isStormRisk: false,
      level: "none",
      title: "Brak zagrożeń burzowych",
      message: "Brak wyładowań atmosferycznych.",
      lightningPotential: 0
    };
  }

  const code = current.weather_code ?? 0;
  const precip = current.precipitation ?? 0;
  const gusts = current.wind_gusts_10m ?? current.wind_speed_10m ?? 0;
  const lp = current.lightning_potential ?? 0;

  // Check hourly lightning potential or storm codes in current/next 3 hours
  let maxHourlyLP = lp;
  let upcomingStormCode = false;

  if (hourly && Array.isArray(hourly.time)) {
    const now = new Date();
    const hourNum = now.getHours();
    const startIndex = hourly.time.findIndex((t: string) => new Date(t).getHours() === hourNum);
    const validStart = startIndex !== -1 ? startIndex : 0;
    
    for (let i = validStart; i < Math.min(hourly.time.length, validStart + 3); i++) {
      const hCode = hourly.weather_code?.[i] ?? 0;
      const hLP = hourly.lightning_potential?.[i] ?? 0;
      if (hLP > maxHourlyLP) maxHourlyLP = hLP;
      if ((hCode >= 95 && hCode <= 99) || hCode === 29) upcomingStormCode = true;
    }
  }

  const isDirectStormCode = (code >= 95 && code <= 99) || code === 29;
  const hasActiveLightning = lp > 2 || maxHourlyLP > 8;
  const isConvectiveShowerStorm = (code >= 80 && code <= 82) && (precip >= 1.0 || gusts >= 40 || lp > 0.5);

  const isStorm = isDirectStormCode || hasActiveLightning || (isConvectiveShowerStorm && precip >= 2.0);
  const isStormRisk = isStorm || upcomingStormCode || maxHourlyLP > 0.5 || (code >= 80 && code <= 82) || (precip > 0.8 && gusts > 40);

  let title = "Brak zagrożeń burzowych";
  let message = "W okolicy nie wykryto wyładowań atmosferycznych ani chmur burzowych.";

  if (isStorm) {
    title = "AKTYWNA BURZA Z WYŁADOWANIAMI ⚡";
    message = `W Twoim rejonie występują wyładowania i chmury burzowe (porywy: ${Math.round(gusts)} km/h, opady: ${precip.toFixed(1)} mm/h). Schowaj się w bezpiecznym budynku!`;
  } else if (isStormRisk) {
    title = "RYZYKO BURZY I LOKALNYCH WYŁADOWAŃ 🌩️";
    message = `Wykryto niestabilność konwekcyjną w rejonie. Możliwe nagłe rozwinięcie komórki burzowej i porywisty wiatr!`;
  }

  return {
    isStorm,
    isStormRisk,
    level: isStorm ? "active" : isStormRisk ? "risk" : "none",
    title,
    message,
    lightningPotential: maxHourlyLP
  };
}

export interface LeafWetnessResult {
  score: number; // 0 to 15
  formatted: string; // "0/15", "4/15", "12/15"
  level: "dry" | "trace" | "light_dew" | "heavy_dew" | "rain_saturated";
  title: string;
  description: string;
  source: string;
  riskStatus: "optimal" | "moderate" | "high_pathogen_risk" | "no_spraying";
}

/**
 * Calculates Leaf Wetness on the standard 0 to 15 agrometeorological scale (LWD index).
 * Evaluates real precipitation, relative humidity, air temperature, dew point depression,
 * night-time radiative canopy cooling, wind speed, and WMO weather codes.
 */
export function calculateLeafWetness(
  precipitation: number | null | undefined,
  humidity: number | null | undefined,
  temperature: number | null | undefined,
  dewPoint?: number | null,
  isDay: number = 1,
  windSpeed: number = 10,
  stationName?: string,
  weatherCode?: number | null
): LeafWetnessResult {
  const p = typeof precipitation === "number" && !isNaN(precipitation) ? Math.max(0, precipitation) : 0;
  const h = typeof humidity === "number" && !isNaN(humidity) ? Math.max(0, Math.min(100, humidity)) : 50;
  const t = typeof temperature === "number" && !isNaN(temperature) ? temperature : 15;
  const dp = dewPoint !== undefined && dewPoint !== null ? dewPoint : calculateDewPoint(t, h);
  const safeWind = typeof windSpeed === "number" && !isNaN(windSpeed) ? Math.max(0, windSpeed) : 10;
  const safeIsDay = isDay === 0 ? 0 : 1;

  let score = 0;
  let level: "dry" | "trace" | "light_dew" | "heavy_dew" | "rain_saturated" = "dry";
  let title = "Suchy liść (0/15)";
  let description = "Brak zwilżenia blaszki liściowej. Optymalne okno na zabiegi ochronne i opryski polowe.";
  let riskStatus: "optimal" | "moderate" | "high_pathogen_risk" | "no_spraying" = "optimal";

  // WMO precipitation codes (50-99: drizzle, rain, snow, showers, thunderstorm)
  const isPrecipCode = typeof weatherCode === "number" && weatherCode >= 50 && weatherCode <= 99;
  // WMO recent precipitation codes (20-29: recent precipitation)
  const isRecentPrecipCode = typeof weatherCode === "number" && weatherCode >= 20 && weatherCode <= 29;
  // WMO fog codes (45, 48: fog with rime / depositing fog)
  const isFogCode = typeof weatherCode === "number" && (weatherCode === 45 || weatherCode === 48);

  // 1. PRIORITY: Active measured precipitation
  if (p > 0.05) {
    score = Math.min(15, Math.max(12, Math.round(12 + Math.min(3, p * 2))));
    level = "rain_saturated";
    title = `Zwilżenie deszczowe (${score}/15)`;
    description = `Aktywne opady deszczu (${p} mm). Całkowite nasycenie blaszki liściowej – zakaz wykonywania oprysków zmywalnych.`;
    riskStatus = "no_spraying";
  } else if (p > 0) {
    score = 11;
    level = "rain_saturated";
    title = `Śladowy opad deszczu (${score}/15)`;
    description = `Zarejestrowano śladowe opady deszczu (${p} mm). Liście mokre, odradza się zabiegi zmywalne.`;
    riskStatus = "no_spraying";
  } else if (isPrecipCode) {
    score = 10;
    level = "heavy_dew";
    title = `Mokry liść / mżawka (${score}/15)`;
    description = "Blaszka liściowa wilgotna pod wpływem mżawki lub przelotnego opadu. Unikaj zabiegów zmywalnych.";
    riskStatus = "high_pathogen_risk";
  } else {
    // 2. CONDENSATION & DEW MODEL (Probabilistic-physical microclimate model)
    const rawDewDepression = dp !== null ? Math.max(0, t - dp) : Math.max(0, (100 - h) / 5);

    // Radiative canopy cooling factor:
    // At night (isDay === 0), vegetation surface cools ~1.5 - 3.0°C below 2m air temperature under calm skies.
    // Higher wind speed mixes canopy air with 2m air, suppressing the radiative inversion and drying leaves.
    const windCalmFactor = Math.max(0.15, 1 - Math.min(1, safeWind / 28));
    const nightRadiativeDrop = safeIsDay === 0 ? 2.3 * windCalmFactor : 0.4 * windCalmFactor;
    const effectiveDewDepression = Math.max(0, rawDewDepression - nightRadiativeDrop);

    // Calculate raw condensation score from effective dew depression and humidity
    let calculatedScore = 0;

    if (effectiveDewDepression <= 0.5 || h >= 95 || (isFogCode && h >= 88)) {
      // Obfita rosa / nasycenie kondensacyjne
      const intensity = effectiveDewDepression <= 0.2 ? 11 : effectiveDewDepression <= 0.4 ? 10 : 9;
      calculatedScore = Math.min(11, Math.max(8, intensity));
    } else if (effectiveDewDepression <= 1.8 || h >= 84 || (isFogCode && h >= 75)) {
      // Lekka rosa / wilgotny liść
      const subScore = Math.round(7 - ((effectiveDewDepression - 0.5) / 1.3) * 3);
      calculatedScore = Math.min(7, Math.max(4, subScore));
    } else if (effectiveDewDepression <= 3.8 || (safeIsDay === 0 && h >= 68) || (safeIsDay === 1 && h >= 74)) {
      // Śladowa wilgoć / możliwa rosa przygruntowa
      const subScore = effectiveDewDepression <= 2.8 || h >= 75 ? 3 : 2;
      calculatedScore = Math.min(3, Math.max(2, subScore));
    } else if (effectiveDewDepression <= 5.0 && safeIsDay === 0 && safeWind <= 12) {
      // Minimalna wilgoć nocna w zacisznych mikrozagłębieniach
      calculatedScore = 1;
    } else {
      // Całkowicie sucho
      calculatedScore = 0;
    }

    // Boost if recent precipitation code is active and humidity is high
    if (isRecentPrecipCode && calculatedScore < 6 && h >= 70) {
      calculatedScore = Math.min(8, calculatedScore + 3);
    }

    // Wind dispersion penalty for strong drying winds (> 20 km/h)
    if (safeWind > 20 && calculatedScore > 0 && calculatedScore <= 7) {
      calculatedScore = Math.max(0, calculatedScore - 1);
    }

    score = Math.min(15, Math.max(0, calculatedScore));

    // Assign UI categories, titles and descriptions according to standard 0-15 LWD scale
    if (score >= 12) {
      level = "rain_saturated";
      title = `Mokry liść (${score}/15)`;
      description = "Wysokie nasycenie wilgocią. Zakaz zabiegów zmywalnych ze względu na ryzyko spłukania preparatu.";
      riskStatus = "no_spraying";
    } else if (score >= 8) {
      level = "heavy_dew";
      title = safeIsDay === 0 ? `Obfita rosa nocna (${score}/15)` : `Obfita rosa poranna (${score}/15)`;
      description = "Długotrwałe zwilżenie kondensacyjne blaszki liściowej. Wysoka presja chorób grzybowych (parch, mączniak, szara pleśń).";
      riskStatus = "high_pathogen_risk";
    } else if (score >= 4) {
      level = "light_dew";
      title = `Lekka rosa / wilgotny liść (${score}/15)`;
      description = "Umiarkowane zwilżenie powierzchni liści. Zalecana ostrożność przy opryskach fungicydowych i dolistnych.";
      riskStatus = "moderate";
    } else if (score >= 2) {
      level = "trace";
      title = safeIsDay === 0 ? `Możliwa rosa nocna (${score}/15)` : `Śladowa wilgoć / możliwa rosa (${score}/15)`;
      description = "Warunki sprzyjające kondensacji przy gruncie lub początek schnięcia roślin. Niewielka wilgoć na trawie i dolnych liściach.";
      riskStatus = "optimal";
    } else if (score === 1) {
      level = "dry";
      title = `Prawie suchy liść (${score}/15)`;
      description = "Pojedyncze krople w mikrozagłębieniach terenu, szybko ustępujące. Bardzo dobre warunki do zabiegów agro.";
      riskStatus = "optimal";
    } else {
      level = "dry";
      title = "Suchy liść (0/15)";
      description = "Blaszka liściowa całkowicie sucha. Optymalne okno na wchłaniania nawozów dolistnych i zabiegi ochronne.";
      riskStatus = "optimal";
    }
  }

  const source = stationName
    ? `Fizyczny model kondensacji Agro (stacja IMGW ${stationName})`
    : "Fizyczny model kondensacji Agro (RH / Depresja Punktu Rosy / Radiacja)";

  return {
    score,
    formatted: `${score}/15`,
    level,
    title,
    description,
    source,
    riskStatus
  };
}

/**
 * Model 2 – Layer Overlap & Transmittance Model (OptiCloud)
 * Oblicza optyczne (odczuwalne dla człowieka) zachmurzenie na podstawie pionowych warstw chmur.
 *
 * Współczynniki optyczne:
 * - low (chmury niskie): 1.0 (pełna nieprzezroczystość optyczna)
 * - mid (chmury średnie): 0.55 (umiarkowane tłumienie)
 * - high (chmury wysokie): 0.15 (wysoka przezroczystość, chmury pierzaste)
 */
export function calculateOpticalCloudCover(
  low: number | null | undefined,
  mid: number | null | undefined,
  high: number | null | undefined,
  total?: number | null
): number {
  const clamp = (val: number | null | undefined): number => {
    if (typeof val !== "number" || isNaN(val)) return 0;
    return Math.min(100, Math.max(0, val));
  };

  // Jeśli brak danych o warstwach, a dostępny jest total, użyj go jako fallback diagnostyczny
  if (low == null && mid == null && high == null && typeof total === "number" && !isNaN(total)) {
    return Math.min(100, Math.max(0, Math.round(total)));
  }

  const lowClean = clamp(low);
  const midClean = clamp(mid);
  const highClean = clamp(high);

  const lowFraction = lowClean / 100;
  const midFraction = midClean / 100;
  const highFraction = highClean / 100;

  const effectiveLow = lowFraction * 1.0;
  const remainingAfterLow = 1 - lowFraction;
  const effectiveMid = remainingAfterLow * midFraction * 0.55;
  const remainingAfterMid = remainingAfterLow * (1 - midFraction);
  const effectiveHigh = remainingAfterMid * highFraction * 0.15;

  const optical = effectiveLow + effectiveMid + effectiveHigh;
  return Math.min(100, Math.max(0, Math.round(optical * 100)));
}

/**
 * Interpretacja słowna wskaźnika Zachmurzenia Optycznego (OptiCloud)
 */
export function getOpticalCloudDescription(opticalPercent: number): string {
  const val = Math.min(100, Math.max(0, opticalPercent));
  if (val <= 15) return "Bezchmurnie / pełne słońce";
  if (val <= 35) return "Przewaga słońca";
  if (val <= 60) return "Umiarkowane zachmurzenie";
  if (val <= 85) return "Duże zachmurzenie";
  return "Całkowite zachmurzenie";
}

export interface SmartWeatherTrendAlert {
  type: "wind" | "rain" | "rain_incoming" | "uv_peak" | "heat" | "stable";
  title: string;
  message: string;
  badge: string;
  severity: "alert" | "warning" | "info" | "success";
  highlightTime?: string;
  iconType: "wind" | "rain" | "sun" | "heat" | "sparkles";
}

export interface SmartClothingAdvice {
  solarBonus: number;
  solarFeltTemp: number;
  hasSolarAdvantage: boolean;
  radiationWm2: number;
  apparentTemp: number;
  outfitTitle: string;
  outfitRecommendation: string;
  clothingLayers: string[];
}

/**
 * Inteligentne Powiadomienia Cykliczne (Wiatr, Opady, Słońce) na najbliższe 12h
 */
export function getSmartWeatherTrendAlert(
  current: any,
  hourly: any,
  currentIdx: number = 0,
  currentWindSpeed?: number | null,
  currentWindGusts?: number | null,
  currentPrecipitation?: number | null
): SmartWeatherTrendAlert {
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const gustsArr: number[] = Array.isArray(hourly?.wind_gusts_10m) ? hourly.wind_gusts_10m : [];
  const windArr: number[] = Array.isArray(hourly?.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const precipArr: number[] = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];
  const popArr: number[] = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const uvArr: number[] = Array.isArray(hourly?.uv_index) ? hourly.uv_index : [];
  const tempArr: number[] = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];

  const startIdx = Math.max(0, currentIdx);
  const endIdx = Math.min(times.length, startIdx + 12);

  const curGusts = typeof currentWindGusts === 'number'
    ? currentWindGusts
    : (typeof current?.wind_gusts_10m === 'number'
        ? current.wind_gusts_10m
        : (gustsArr[startIdx] ?? (typeof currentWindSpeed === 'number' ? Math.round(currentWindSpeed * 1.3) : 0)));

  const curPrecip = typeof currentPrecipitation === 'number'
    ? currentPrecipitation
    : (typeof current?.precipitation === 'number' ? current.precipitation : (precipArr[startIdx] ?? 0));

  const curTemp = typeof current?.temperature_2m === 'number'
    ? current.temperature_2m
    : (tempArr[startIdx] ?? 15);

  // 1. WIATR: Jeśli aktualne porywy wiatru przekraczają 35 km/h
  if (curGusts > 35) {
    let peakEndHourStr: string | null = null;
    let peakEndGusts: number = 0;
    let calmHourStr: string | null = null;

    for (let i = startIdx + 1; i < endIdx; i++) {
      const g = typeof gustsArr[i] === 'number' 
        ? gustsArr[i] 
        : (typeof windArr[i] === 'number' ? windArr[i] * 1.3 : 0);
      const w = typeof windArr[i] === 'number' ? windArr[i] : 0;

      // Spadek porywów poniżej 28 km/h oraz średniego wiatru poniżej 20 km/h (wyraźne wyciszenie)
      if (g < 28 && w < 20 && !calmHourStr) {
        if (times[i]) {
          const d = new Date(times[i]);
          calmHourStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }
      }

      // Moment przejścia szczytu porywów poniżej 33 km/h
      if (g < 33 && !peakEndHourStr) {
        if (times[i]) {
          const d = new Date(times[i]);
          peakEndHourStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
          peakEndGusts = Math.round(g);
        }
      }
    }

    // A. Szczyt wiatru mija i spada poniżej 33 km/h (ale jeszcze nie jest < 28 km/h lub pozostaje w okolicach ~30 km/h)
    if (curGusts >= 40 && peakEndHourStr && peakEndGusts >= 26) {
      return {
        type: "wind",
        title: "Szczyt porywów wiatru",
        message: `Najsilniejsze porywy wiatru (do ${Math.round(curGusts)} km/h) potrwają do około godziny ${peakEndHourStr}. Wieczorem wiatr nieco słabnie, ale nadal pozostanie porywisty (do ~${Math.max(28, peakEndGusts)} km/h).`,
        badge: "SZCZYT WIATRU",
        severity: "warning",
        highlightTime: peakEndHourStr,
        iconType: "wind"
      };
    }

    // B. Wiatr wyraźnie odpuszcza poniżej 28 km/h
    if (calmHourStr) {
      return {
        type: "wind",
        title: "Silne porywy wiatru",
        message: `Obecnie silne porywy wiatru (do ${Math.round(curGusts)} km/h). Wiatr zacznie wyraźnie odpuszczać około godziny ${calmHourStr}.`,
        badge: "PORYWY WIATRU",
        severity: "warning",
        highlightTime: calmHourStr,
        iconType: "wind"
      };
    } 
    
    // C. Spadek poniżej 33 km/h przy łagodniejszym punkcie wyjścia (curGusts 35-39 km/h)
    if (peakEndHourStr) {
      return {
        type: "wind",
        title: "Porywisty wiatr",
        message: `Najsilniejsze porywy wiatru (do ${Math.round(curGusts)} km/h) potrwają do około godziny ${peakEndHourStr}. Później wiatr nieco osłabnie (do ~${peakEndGusts} km/h).`,
        badge: "PORYWY WIATRU",
        severity: "warning",
        highlightTime: peakEndHourStr,
        iconType: "wind"
      };
    }

    // D. Wiatr nie spada poniżej 38 km/h przez całe 12h
    return {
      type: "wind",
      title: "Utrzymujący się porywisty wiatr",
      message: `Obecnie silne porywy wiatru (do ${Math.round(curGusts)} km/h). Porywisty wiatr utrzyma się przez cały wieczór i noc.`,
      badge: "PORYWISTY WIATR",
      severity: "warning",
      iconType: "wind"
    };
  }

  // 2. OPADY: Jeśli deszcz pada teraz
  if (curPrecip >= 0.1) {
    let stopHourStr: string | null = null;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const p = precipArr[i] ?? 0;
      const pop = popArr[i] ?? 0;
      if (p < 0.1 && pop < 25) {
        if (times[i]) {
          const d = new Date(times[i]);
          stopHourStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        }
        break;
      }
    }

    if (stopHourStr) {
      return {
        type: "rain",
        title: "Trwające opady deszczu",
        message: `Opady deszczu potrwają do około godziny ${stopHourStr}.`,
        badge: "OPADY DESZCZU",
        severity: "alert",
        highlightTime: stopHourStr,
        iconType: "rain"
      };
    } else {
      return {
        type: "rain",
        title: "Ciągłe opady deszczu",
        message: "Opady deszczu utrzymają się przez najbliższe godziny.",
        badge: "CIĄGŁE OPADY",
        severity: "alert",
        iconType: "rain"
      };
    }
  }

  // 3. OPADY ZBLIŻAJĄCE SIĘ (w ciągu 1-6 godzin)
  for (let i = startIdx + 1; i < Math.min(times.length, startIdx + 7); i++) {
    const p = precipArr[i] ?? 0;
    const pop = popArr[i] ?? 0;
    if (p >= 0.2 || pop >= 45) {
      const d = new Date(times[i]);
      const startHourStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      return {
        type: "rain_incoming",
        title: "Zbliżające się opady",
        message: `Około godziny ${startHourStr} spodziewany początek opadów (szansa ${pop}%).`,
        badge: "DESZCZ W DRODZE",
        severity: "warning",
        highlightTime: startHourStr,
        iconType: "rain"
      };
    }
  }

  // 4. BPA / SŁOŃCE / UV: Szczyt promieniowania
  let maxUvVal = 0;
  let peakUvHourStr: string | null = null;
  for (let i = startIdx; i < endIdx; i++) {
    const uv = uvArr[i] ?? 0;
    if (uv > maxUvVal) {
      maxUvVal = uv;
      if (times[i]) {
        const d = new Date(times[i]);
        peakUvHourStr = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      }
    }
  }

  if (maxUvVal >= 3.5 && peakUvHourStr) {
    const uvDesc = getUvIndexDescription(maxUvVal);
    return {
      type: "uv_peak",
      title: "Szczyt promieniowania słonecznego",
      message: `Szczyt promieniowania UV (${Math.round(maxUvVal)} – ${uvDesc}) przypadnie około godziny ${peakUvHourStr}. Pamiętaj o ochronie przeciwsłonecznej.`,
      badge: "SZCZYT UV",
      severity: maxUvVal >= 6 ? "warning" : "info",
      highlightTime: peakUvHourStr,
      iconType: "sun"
    };
  }

  // 5. UPAŁ
  if (curTemp >= 28) {
    return {
      type: "heat",
      title: "Wysoka temperatura",
      message: `Upał do ${Math.round(curTemp)}°C – pamiętaj o regularnym piciu wody i nakryciu głowy w słońcu.`,
      badge: "UPAŁ",
      severity: "warning",
      iconType: "heat"
    };
  }

  // 6. STABILNE WARUNKI
  return {
    type: "stable",
    title: "Stabilna pogoda",
    message: "Stabilne warunki atmosferyczne na najbliższe 12 godzin – brak silnych porywów wiatru i nagłych opadów.",
    badge: "STABILNA AURA",
    severity: "success",
    iconType: "sparkles"
  };
}

/**
 * Asystent Ubioru i Realnego Odczucia Słonecznego (Solar Advantage)
 */
export function getSmartClothingAdvice(
  apparentTemp: number,
  currentTemp: number,
  radiationWm2?: number | null,
  cloudCover?: number | null,
  windSpeed?: number | null,
  windGusts?: number | null,
  precipitation?: number | null,
  isDay?: number | null
): SmartClothingAdvice {
  const rad = typeof radiationWm2 === 'number' && !isNaN(radiationWm2) ? radiationWm2 : 0;
  const cloud = typeof cloudCover === 'number' && !isNaN(cloudCover) ? cloudCover : 50;
  const day = isDay === 1 || (isDay === undefined && rad > 30);
  const precip = typeof precipitation === 'number' ? precipitation : 0;

  let solarBonus = 0;
  let hasSolarAdvantage = false;

  // Obliczanie Solar Advantage (Bonus Słoneczny +3°C do +6°C)
  if (day && rad >= 350 && cloud <= 65) {
    const cloudFactor = Math.max(0.5, (100 - cloud) / 100);
    const rawBonus = ((rad / 700) * 5.0) * cloudFactor;
    solarBonus = Math.min(6.0, Math.max(3.0, Number(rawBonus.toFixed(1))));
    hasSolarAdvantage = true;
  } else if (day && rad >= 200 && cloud <= 40) {
    solarBonus = 2.0;
    hasSolarAdvantage = true;
  }

  const solarFeltTemp = Number((apparentTemp + solarBonus).toFixed(1));

  let outfitTitle = "";
  let outfitRecommendation = "";
  let clothingLayers: string[] = [];

  // Scenariusz z Solar Advantage:
  if (hasSolarAdvantage && solarBonus >= 2.5) {
    if (solarFeltTemp >= 20) {
      outfitTitle = "Efekt Słońca (Solar Advantage)";
      outfitRecommendation = `Słońce mocno grzeje w plecy mimo wiatru (odczuwalne w słońcu ~${Math.round(solarFeltTemp)}°C) – kurtka to za dużo, wystarczy krótki rękaw + lekka bluza!`;
      clothingLayers = ["T-shirt / krótki rękaw", "Lekka bluza na cień", "Okulary przeciwsłoneczne"];
    } else if (solarFeltTemp >= 14) {
      outfitTitle = "Przyjemne ciepło w słońcu";
      outfitRecommendation = `Słońce dodaje odczuwalne +${Math.round(solarBonus)}°C (w słońcu ~${Math.round(solarFeltTemp)}°C). Lekka bluza lub wiatrówka w zupełności wystarczą, w słońcu będzie bardzo przyjemnie!`;
      clothingLayers = ["Cienka bluza lub sweter", "Lekkie spodnie", "Okulary przeciwsłoneczne"];
    } else {
      outfitTitle = "Słońce dogrzewa chłód";
      outfitRecommendation = `W cieniu rześko, ale promienie słoneczne dają odczucie ~${Math.round(solarFeltTemp)}°C (+${Math.round(solarBonus)}°C). Ubierz się warstwowo (na cebulkę) – łatwo zdjąć wierzchnią warstwę na słońcu.`;
      clothingLayers = ["Kurtka przejściowa", "Cieplejsza bluza", "T-shirt pod spód"];
    }
  } else {
    // Standardowa rekomendacja na bazie apparentTemp
    if (apparentTemp < -5) {
      outfitTitle = "Ekstremalny mróz i chłód";
      outfitRecommendation = `Przejmujący mróz (odczuwalne ${Math.round(apparentTemp)}°C) – gruba puchowa kurtka zimowa, termoaktywna bielizna, ciepła czapka i rękawiczki obowiązkowe!`;
      clothingLayers = ["Puchowa kurtka zimowa", "Bielizna termoaktywna", "Ciepła czapka i rękawice"];
    } else if (apparentTemp < 4) {
      outfitTitle = "Zimowo i chłodno";
      outfitRecommendation = `Niska temperatura (odczuwalne ${Math.round(apparentTemp)}°C) – ciepła kurtka zimowa lub gruba przejściówka, czapka i długie ocieplane spodnie.`;
      clothingLayers = ["Kurtka zimowa / ocieplana", "Ciepły sweter lub polar", "Czapka lub opaska"];
    } else if (apparentTemp < 11) {
      outfitTitle = "Rześko i wietrznie";
      outfitRecommendation = `Chłodne powietrze (odczuwalne ${Math.round(apparentTemp)}°C) – solidna kurtka przejściowa, polar lub sweter. Zadbaj o osłonę szyi.`;
      clothingLayers = ["Kurtka przejściowa / wiatrówka", "Bluza z kapturem lub sweter", "Długie spodnie"];
    } else if (apparentTemp < 17) {
      outfitTitle = "Umiarkowane warunki";
      outfitRecommendation = `Umiarkowana temperatura (odczuwalne ${Math.round(apparentTemp)}°C) – idealny zestaw to T-shirt + bluza rozpinana lub lekka kurtka wiatrówka.`;
      clothingLayers = ["Lekka bluza lub wiatrówka", "T-shirt", "Długie spodnie"];
    } else if (apparentTemp < 23) {
      outfitTitle = "Komfortowo i ciepło";
      outfitRecommendation = `Bardzo przyjemne warunki (odczuwalne ${Math.round(apparentTemp)}°C) – wystarczy T-shirt lub koszulka polo. Ewentualnie lekka narzutka na chłodniejszy wieczór.`;
      clothingLayers = ["Koszulka z krótkim rękawem", "Lekkie spodnie / chinosy", "Lekka bluza na wieczór"];
    } else {
      outfitTitle = "Letni upał i słońce";
      outfitRecommendation = `Gorąco (odczuwalne ${Math.round(apparentTemp)}°C) – załóż jak najlżejsze, przewiewne ubranie (krótkie spodenki, luźny T-shirt lub len) i pamiętaj o nakryciu głowy!`;
      clothingLayers = ["Krótkie spodenki", "Przewiewny T-shirt / len", "Czapka z daszkiem"];
    }
  }

  if (precip >= 0.2) {
    outfitRecommendation += " 🌧️ Pada deszcz – nie zapomnij o parasolu lub kurtce z membraną!";
    if (!clothingLayers.includes("Parasol / kurtka przeciwdeszczowa")) {
      clothingLayers.unshift("Parasol / kurtka przeciwdeszczowa");
    }
  }

  return {
    solarBonus,
    solarFeltTemp,
    hasSolarAdvantage,
    radiationWm2: rad,
    apparentTemp,
    outfitTitle,
    outfitRecommendation,
    clothingLayers
  };
}

export interface DriverRoadAlert {
  type: "crosswind" | "aquaplaning" | "glare" | "black_ice" | "fog" | "ideal";
  title: string;
  message: string;
  badge: string;
  severity: "alert" | "warning" | "info" | "success";
  highlight?: string;
  iconType: "wind" | "rain" | "sun" | "ice" | "car" | "check";
}

/**
 * 1. MODUŁ DLA KIEROWCY (Warunki na drodze)
 */
export function getDriverRoadConditions(
  current: any,
  hourly: any,
  daily: any,
  currentIdx: number = 0,
  currentWindSpeed?: number | null,
  currentWindGusts?: number | null,
  currentPrecipitation?: number | null,
  currentTemp?: number | null,
  currentCloudCover?: number | null,
  isDay?: number | null
): DriverRoadAlert {
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const gustsArr: number[] = Array.isArray(hourly?.wind_gusts_10m) ? hourly.wind_gusts_10m : [];
  const windArr: number[] = Array.isArray(hourly?.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const precipArr: number[] = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];
  const cloudArr: number[] = Array.isArray(hourly?.cloud_cover) ? hourly.cloud_cover : [];
  const visArr: number[] = Array.isArray(hourly?.visibility) ? hourly.visibility : [];

  const startIdx = Math.max(0, currentIdx);

  const curGusts = typeof currentWindGusts === 'number'
    ? currentWindGusts
    : (typeof current?.wind_gusts_10m === 'number'
        ? current.wind_gusts_10m
        : (gustsArr[startIdx] ?? (typeof currentWindSpeed === 'number' ? Math.round(currentWindSpeed * 1.3) : 0)));

  const curPrecip = typeof currentPrecipitation === 'number'
    ? currentPrecipitation
    : (typeof current?.precipitation === 'number' ? current.precipitation : (precipArr[startIdx] ?? 0));

  const curTemp = typeof currentTemp === 'number'
    ? currentTemp
    : (typeof current?.temperature_2m === 'number' ? current.temperature_2m : (hourly?.temperature_2m?.[startIdx] ?? 15));

  const curCloud = typeof currentCloudCover === 'number'
    ? currentCloudCover
    : (typeof current?.cloud_cover === 'number' ? current.cloud_cover : (cloudArr[startIdx] ?? 40));

  const curVis = typeof current?.visibility === 'number' ? current.visibility : (visArr[startIdx] ?? 10000);

  // A. GOŁOLEDŹ / ŚLISKO NA MOŚCIE / MRÓZ
  if (curTemp <= 1.0 && (curPrecip > 0 || (current?.relative_humidity_2m && current.relative_humidity_2m > 85))) {
    return {
      type: "black_ice",
      title: "Ryzyko czarnego lodu / przymrozku",
      message: "Temperatura w pobliżu zera: Zwróć szczególną uwagę na mostach, wiaduktach i w zacienionych lasach!",
      badge: "CZARNY LÓD",
      severity: "alert",
      iconType: "ice"
    };
  }

  // B. AUA / GŁĘBOKIE KAŁUŻE / AQUAPLANING
  if (curPrecip >= 2.5) {
    return {
      type: "aquaplaning",
      title: "Dużo wody na asfalcie",
      message: "Ryzyko utraty przyczepności w głębokich kałużach, zwolnij na zakrętach i zachowaj większy odstęp!",
      badge: "AQUAPLANING",
      severity: "alert",
      iconType: "rain"
    };
  }

  // C. BOCZNY WIATR (Porywy > 35 km/h)
  if (curGusts > 35) {
    return {
      type: "crosswind",
      title: "Ostrzeżenie przed bocznym wiatrem",
      message: "Uważaj na otwartych trasach i przy wyprzedzaniu ciężarówek – potrafi mocno bujnąć autem!",
      badge: "BOCZNY WIATR",
      severity: "warning",
      highlight: `Porywy do ${Math.round(curGusts)} km/h`,
      iconType: "wind"
    };
  }

  // D. OŚLEPIAJĄCE SŁOŃCE (1-2h przed zachodem słońca przy bezchmurnym/niskim zachmurzeniu)
  const now = new Date();
  let sunsetDate: Date | null = null;
  if (Array.isArray(daily?.sunset) && daily.sunset[0]) {
    sunsetDate = new Date(daily.sunset[0]);
  }

  const isLowSunTime = (() => {
    if (sunsetDate && !isNaN(sunsetDate.getTime())) {
      const diffMins = (sunsetDate.getTime() - now.getTime()) / (1000 * 60);
      return diffMins > 0 && diffMins <= 120;
    }
    // Fallback: typowa pora wieczorna 17:00-19:30
    const hour = now.getHours();
    return (hour >= 17 && hour <= 19) && (isDay === 1 || isDay === undefined);
  })();

  if (isLowSunTime && curCloud <= 40 && curPrecip < 0.1) {
    return {
      type: "glare",
      title: "Niskie, oślepiające słońce",
      message: "Będzie walić prosto w szybę i oślepiać na trasie zachodniej, przygotuj okulary przeciwsłoneczne!",
      badge: "OŚLEPIAJĄCE SŁOŃCE",
      severity: "warning",
      iconType: "sun"
    };
  }

  // E. MGŁA (słaba widoczność)
  if (curVis < 1500 && curVis > 0) {
    return {
      type: "fog",
      title: "Ograniczona widoczność",
      message: `Gęste zamglenie (widoczność ~${Math.round(curVis)} m). Włącz światła mijania lub przeciwmgielne i zwolnij.`,
      badge: "MGŁA",
      severity: "warning",
      iconType: "rain"
    };
  }

  // F. DOBRE WARUNKI
  return {
    type: "ideal",
    title: "Warunki idealne",
    message: "Czysta droga, dobra widoczność i brak niebezpiecznych zjawisk pogodowych.",
    badge: "CZYSTA TRASA",
    severity: "success",
    iconType: "car"
  };
}

export interface BestWalkWindow {
  windowStr: string;
  badge: string;
  title: string;
  explanation: string;
  highlights: string[];
  recommendedNow: boolean;
  score: number;
}

/**
 * 2. OKNO NA SPACER / WYJŚCIE Z PSEM (Best Time Window)
 * Analizuje najbliższe 8-10 godzin pod kątem wiatru, opadów, temperatury i słońca.
 */
export function getBestWalkTimeWindow(
  current: any,
  hourly: any,
  currentIdx: number = 0,
  currentWindSpeed?: number | null,
  currentWindGusts?: number | null,
  currentPrecipitation?: number | null,
  currentTemp?: number | null
): BestWalkWindow {
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const gustsArr: number[] = Array.isArray(hourly?.wind_gusts_10m) ? hourly.wind_gusts_10m : [];
  const windArr: number[] = Array.isArray(hourly?.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const precipArr: number[] = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];
  const popArr: number[] = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const tempArr: number[] = Array.isArray(hourly?.temperature_2m) ? hourly.temperature_2m : [];
  const uvArr: number[] = Array.isArray(hourly?.uv_index) ? hourly.uv_index : [];

  const startIdx = Math.max(0, currentIdx);
  const totalHours = Math.min(times.length, startIdx + 10);

  const startGusts = typeof currentWindGusts === 'number'
    ? currentWindGusts
    : (typeof current?.wind_gusts_10m === 'number'
        ? current.wind_gusts_10m
        : (gustsArr[startIdx] ?? 20));

  const startPrecip = typeof currentPrecipitation === 'number'
    ? currentPrecipitation
    : (typeof current?.precipitation === 'number' ? current.precipitation : (precipArr[startIdx] ?? 0));

  const startTemp = typeof currentTemp === 'number'
    ? currentTemp
    : (typeof current?.temperature_2m === 'number' ? current.temperature_2m : (tempArr[startIdx] ?? 18));

  // Ocena godzin dla okna 2-godzinnego [i, i+1]
  let bestWindowStart = startIdx;
  let bestScore = -999;

  for (let i = startIdx; i < totalHours - 1; i++) {
    const p1 = precipArr[i] ?? 0;
    const p2 = precipArr[i + 1] ?? 0;
    const pop1 = popArr[i] ?? 0;
    const pop2 = popArr[i + 1] ?? 0;

    const g1 = typeof gustsArr[i] === 'number' ? gustsArr[i] : (windArr[i] ? windArr[i] * 1.3 : 15);
    const g2 = typeof gustsArr[i + 1] === 'number' ? gustsArr[i + 1] : (windArr[i + 1] ? windArr[i + 1] * 1.3 : 15);

    const t1 = tempArr[i] ?? 18;
    const t2 = tempArr[i + 1] ?? 18;
    const avgT = (t1 + t2) / 2;
    const maxG = Math.max(g1, g2);
    const maxP = Math.max(p1, p2);
    const maxPop = Math.max(pop1, pop2);
    const maxUv = Math.max(uvArr[i] ?? 0, uvArr[i + 1] ?? 0);

    let score = 100;

    // Kary za opady
    if (maxP >= 1.0) score -= 65;
    else if (maxP >= 0.2) score -= 40;
    else if (maxPop >= 50) score -= 25;

    // Kary za wiatr
    if (maxG > 45) score -= 40;
    else if (maxG > 35) score -= 25;
    else if (maxG > 28) score -= 12;
    else if (maxG < 22) score += 10;

    // Kary i bonusy za temperaturę
    if (avgT >= 17 && avgT <= 23) score += 15;
    else if (avgT >= 14 && avgT <= 25) score += 5;
    else if (avgT > 29) score -= 30;
    else if (avgT < 5) score -= 20;

    // Kary za upał / prażące słońce w południe
    if (maxUv >= 6) score -= 15;

    // Bonus za popołudniowe/wieczorne uspokojenie
    if (i > startIdx && maxG < startGusts - 8) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestWindowStart = i;
    }
  }

  const isNow = bestWindowStart === startIdx;
  const targetTime1 = times[bestWindowStart] ? new Date(times[bestWindowStart]) : new Date();
  const targetTime2 = times[bestWindowStart + 2] ? new Date(times[bestWindowStart + 2]) : new Date(targetTime1.getTime() + 2 * 3600000);

  const t1Str = targetTime1.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const t2Str = targetTime2.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  const winGust = Math.round(gustsArr[bestWindowStart] ?? 20);
  const winTemp = Math.round(tempArr[bestWindowStart] ?? 18);
  const winPrecip = precipArr[bestWindowStart] ?? 0;

  const windowStr = isNow ? `Teraz – ${t2Str}` : `${t1Str} – ${t2Str}`;

  let explanation = "";
  if (startGusts > 35 && winGust <= 32) {
    explanation = `Wiatr spadnie z ${Math.round(startGusts)} na ~${winGust} km/h, słońce już tak nie praży i brak deszczu.`;
  } else if (startPrecip > 0.2 && winPrecip < 0.1) {
    explanation = `Przerwa w opadach i suchy chodnik – idealna chwila na spacer przed kolejną falą deszczu.`;
  } else if (startTemp >= 27 && winTemp <= 23) {
    explanation = `Temperatura spadnie do komfortowych ~${winTemp}°C, a słońce przestanie mocno dogrzewać.`;
  } else if (isNow) {
    explanation = `Aktualnie panują najlepsze warunki w ciągu dnia – stabilna temperatura (~${winTemp}°C), umiarkowany wiatr i brak deszczu.`;
  } else {
    explanation = `Optymalne okienko pogodowe: najsłabszy wiatr (~${winGust} km/h), sucho i przyjemna temperatura (~${winTemp}°C).`;
  }

  const highlights = [
    `Wiatr: ~${winGust} km/h`,
    winPrecip < 0.1 ? "Brak deszczu" : `Opady ~${winPrecip.toFixed(1)} mm`,
    `Temp: ~${winTemp}°C`
  ];

  return {
    windowStr,
    badge: isNow ? "NAJLEPIEJ TERAZ" : "OKNO CZASOWE",
    title: "Najlepszy czas na spacer z psem / aktywność",
    explanation,
    highlights,
    recommendedNow: isNow,
    score: Math.max(0, Math.min(100, bestScore))
  };
}

