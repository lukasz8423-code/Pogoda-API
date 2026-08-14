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
  LucideIcon 
} from "lucide-react";

export interface WeatherMeta {
  text: string;
  icon: LucideIcon;
  emoji: string;
  gradientClass: string; // Tailwind background gradient matching the mood
  isDarkTheme: boolean;  // True if background is dark, requiring light text
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
export function getWeatherMeta(code: number, isDay: boolean = true, cloudCover?: number): WeatherMeta {
  // Respect raw WMO weather code directly
  const effectiveCode = typeof code === "number" ? code : 0;

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

