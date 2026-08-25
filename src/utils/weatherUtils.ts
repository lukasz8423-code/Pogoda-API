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

export function getCloudCoverLabel(cloudCover: number): string {
  if (cloudCover <= 5) return "Bezchmurnie";
  if (cloudCover <= 30) return "Małe zachmurzenie";
  if (cloudCover <= 70) return "Umiarkowane zachmurzenie";
  if (cloudCover <= 95) return "Duże zachmurzenie";
  return "Pochmurno";
}

/**
 * Maps WMO weather code to readable description, icon, emoji and metadata
 */
export function getWeatherMeta(
  code: number, 
  isDay: boolean = true, 
  cloudCover?: number, 
  precipitation?: number,
  shortwaveRadiation?: number,
  userOverrideCode?: number
): WeatherMeta {
  let effectiveCode = typeof code === "number" ? code : 0;

  // Manual user observation override ("Widok z okna / Korekta lokalna")
  if (typeof userOverrideCode === "number" && !isNaN(userOverrideCode)) {
    effectiveCode = userOverrideCode;
  } else {
    // Check for sunshower condition (active rain while sun is shining and clouds are broken)
    const isSunshower = (typeof precipitation === "number" && precipitation > 0.1) && isDay && (typeof cloudCover === "number" && cloudCover <= 65);

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
      const cc = typeof cloudCover === "number" && !isNaN(cloudCover) ? cloudCover : 20;
      if (hasBrightSunlight && cc < 50) {
        effectiveCode = cc < 15 ? 0 : 1; // Słońce / Bezchmurnie lub Małe zachmurzenie
      } else if (cc < 15) {
        effectiveCode = 0;
      } else if (cc <= 45) {
        effectiveCode = 1;
      } else if (cc <= 75) {
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
    } else if (effectiveCode <= 3 && typeof cloudCover === "number" && !isNaN(cloudCover)) {
      // Synchronize non-precipitating weather codes (0-3) with actual ground cloud cover percentage
      if (cloudCover < 10) {
        effectiveCode = 0;
      } else if (cloudCover <= 40) {
        effectiveCode = 1;
      } else if (cloudCover <= 75) {
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
  if (uv <= 2) return "Niski";
  if (uv <= 5) return "Umiarkowany";
  if (uv <= 7) return "Wysoki";
  if (uv <= 10) return "Bardzo wysoki";
  return "Ekstremalny";
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

