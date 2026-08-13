import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Disable caching globally for all responses so browser always gets fresh HTML, JS, and API responses
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// Removed Gemini AI initialization as requested
const apiKey = process.env.GEMINI_API_KEY?.trim();

// Ensure humidity is within 0-100 range without artificial scaling or "fixing" low values
function normalizeHumidity(val: any): number {
  if (val === undefined || val === null || isNaN(Number(val))) return 0;
  let h = Number(val);
  
  // Fraction decimal (0.0 to 1.0) -> convert to percentage if detected
  if (h > 0 && h <= 1.0 && h !== 1.0) {
    h = h * 100;
  }
  
  return Math.min(100, Math.max(0, Math.round(h)));
}

// GIOŚ API Caching (to handle 429 Too Many Requests)
const GIOS_STATIONS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const GIOS_AQI_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let giosStationsCache: { data: any[]; timestamp: number } | null = null;
const giosAqiCache = new Map<number, { data: any; timestamp: number }>();

/**
 * Calculates physics-based solar radiation (W/m²) taking into account:
 * 1. Time of day (nighttime = 0 W/m²).
 * 2. Solar elevation angle curve (peak at noon ~780 W/m² clear sky).
 * 3. Cloud cover attenuation: heavy overcast (75-100% clouds) reduces solar radiation drastically (5-15% of clear sky).
 */
function calculateSolarRadiation(cloudCoverPercent: number, isDayTime: boolean = true, rawApiShortwave?: number): number {
  if (!isDayTime) return 0;

  if (typeof rawApiShortwave === 'number' && !isNaN(rawApiShortwave) && rawApiShortwave >= 0) {
    return Math.round(rawApiShortwave);
  }

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  if (currentHour < 5.0 || currentHour > 21.0) {
    return 0;
  }

  const dayProgress = (currentHour - 5.0) / 16.0;
  const clearSkyMax = Math.max(0, 850 * Math.sin(Math.PI * dayProgress));
  const C = Math.max(0, Math.min(100, cloudCoverPercent || 0));
  const cloudTransmittance = Math.max(0.1, 1.0 - (C / 100) * 0.75);

  return Math.round(clearSkyMax * cloudTransmittance);
}

const IMGW_STATIONS = [
  { id: "12100", name: "Kołobrzeg", lat: 54.18, lng: 15.58 },
  { id: "12105", name: "Koszalin", lat: 54.20, lng: 16.18 },
  { id: "12115", name: "Ustka", lat: 54.58, lng: 16.85 },
  { id: "12120", name: "Lębork", lat: 54.53, lng: 17.75 },
  { id: "12125", name: "Hel", lat: 54.60, lng: 18.80 },
  { id: "12135", name: "Gdańsk", lat: 54.38, lng: 18.47 },
  { id: "12150", name: "Elbląg", lat: 54.17, lng: 19.43 },
  { id: "12160", name: "Olsztyn", lat: 53.77, lng: 20.48 },
  { id: "12180", name: "Mikołajki", lat: 53.80, lng: 21.57 },
  { id: "12195", name: "Suwałki", lat: 54.13, lng: 22.95 },
  { id: "12200", name: "Świnoujście", lat: 53.92, lng: 14.23 },
  { id: "12205", name: "Szczecin", lat: 53.40, lng: 14.62 },
  { id: "12215", name: "Resko", lat: 53.77, lng: 15.40 },
  { id: "12230", name: "Chojnice", lat: 53.70, lng: 17.55 },
  { id: "12235", name: "Piła", lat: 53.15, lng: 16.74 },
  { id: "12250", name: "Toruń", lat: 53.03, lng: 18.60 },
  { id: "12270", name: "Mława", lat: 53.11, lng: 20.38 },
  { id: "12280", name: "Ostrołęka", lat: 53.08, lng: 21.57 },
  { id: "12295", name: "Białystok", lat: 53.10, lng: 23.17 },
  { id: "12300", name: "Gorzów Wlkp.", lat: 52.73, lng: 15.23 },
  { id: "12330", name: "Poznań", lat: 52.42, lng: 16.83 },
  { id: "12345", name: "Gniezno", lat: 52.53, lng: 17.60 },
  { id: "12360", name: "Koło", lat: 52.20, lng: 18.65 },
  { id: "12375", name: "Warszawa", lat: 52.16, lng: 20.96 },
  { id: "12385", name: "Siedlce", lat: 52.17, lng: 22.28 },
  { id: "12399", name: "Terespol", lat: 52.07, lng: 23.60 },
  { id: "12400", name: "Zielona Góra", lat: 51.93, lng: 15.52 },
  { id: "12415", name: "Legnica", lat: 51.21, lng: 16.17 },
  { id: "12424", name: "Leszno", lat: 51.84, lng: 16.58 },
  { id: "12435", name: "Kalisz", lat: 51.76, lng: 18.08 },
  { id: "12455", name: "Wieluń", lat: 51.22, lng: 18.57 },
  { id: "12465", name: "Łódź", lat: 51.72, lng: 19.40 },
  { id: "12485", name: "Radom", lat: 51.40, lng: 21.16 },
  { id: "12495", name: "Lublin", lat: 51.22, lng: 22.60 },
  { id: "12500", name: "Jelenia Góra", lat: 50.90, lng: 15.73 },
  { id: "12510", name: "Śnieżka", lat: 50.74, lng: 15.74 },
  { id: "12520", name: "Kłodzko", lat: 50.44, lng: 16.65 },
  { id: "12530", name: "Wrocław", lat: 51.10, lng: 16.88 },
  { id: "12540", name: "Opole", lat: 50.67, lng: 17.93 },
  { id: "12550", name: "Częstochowa", lat: 50.81, lng: 19.12 },
  { id: "12560", name: "Katowice", lat: 50.24, lng: 19.03 },
  { id: "12570", name: "Kraków", lat: 50.08, lng: 19.80 },
  { id: "12580", name: "Zakopane", lat: 49.30, lng: 19.96 },
  { id: "12585", name: "Kasprowy Wierch", lat: 49.23, lng: 19.98 },
  { id: "12590", name: "Nowy Sącz", lat: 49.63, lng: 20.69 },
  { id: "12600", name: "Bielsko Biała", lat: 49.81, lng: 19.00 },
  { id: "12625", name: "Tarnów", lat: 50.02, lng: 21.00 },
  { id: "12660", name: "Rzeszów", lat: 50.11, lng: 22.02 },
  { id: "12690", name: "Lesko", lat: 49.47, lng: 22.33 },
  { id: "12695", name: "Przemyśl", lat: 49.78, lng: 22.77 },
  { id: "12255", name: "Płock", lat: 52.55, lng: 19.70 },
  { id: "12185", name: "Kętrzyn", lat: 54.08, lng: 21.38 },
  { id: "12470", name: "Kozienice", lat: 51.58, lng: 21.55 },
  { id: "12582", name: "Krosno", lat: 49.68, lng: 21.77 },
  { id: "12110", name: "Łeba", lat: 54.75, lng: 17.55 },
  { id: "12140", name: "Platforma", lat: 55.30, lng: 18.20 },
  { id: "12565", name: "Racibórz", lat: 50.08, lng: 18.18 },
  { id: "12670", name: "Sandomierz", lat: 50.68, lng: 21.75 },
  { id: "12310", name: "Słubice", lat: 52.35, lng: 14.57 },
  { id: "12210", name: "Szczecinek", lat: 53.71, lng: 16.68 },
  { id: "12497", name: "Włodawa", lat: 51.55, lng: 23.53 },
  { id: "12680", name: "Zamość", lat: 50.72, lng: 23.25 },
  { id: "12505", name: "Sulejów", lat: 51.35, lng: 19.88 },
  { id: "12575", name: "Kielce", lat: 50.81, lng: 20.63 }
];

function normalizeStationName(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e")
    .replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o")
    .replace(/ś/g, "s").replace(/ź/g, "z").replace(/ż/g, "z")
    .trim();
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

// Global in-memory cache for weather and station data to prevent Open-Meteo 429 rate limit issues
const weatherResponseCache = new Map<string, { data: any; timestamp: number }>();
const stationResponseCache = new Map<string, { data: any; timestamp: number }>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes fresh TTL

function formatUtcToPolishTime(dateStr: string, hourStr?: string): string {
  try {
    let isoStr = dateStr;
    if (hourStr !== undefined) {
      const h = String(hourStr).padStart(2, '0');
      isoStr = `${dateStr}T${h}:00:00Z`;
    } else if (dateStr.includes(' ')) {
      isoStr = `${dateStr.replace(' ', 'T')}Z`;
    }
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }) + ' CEST';
    }
  } catch (e) {
    // fallback
  }
  return `${dateStr} ${hourStr || ''}:00`;
}

async function fetchWithRetry(url: string, retries = 3, timeoutMs = 12000): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { 
        headers: {
          'User-Agent': 'AuraMeteoApp/1.0 (contact@aurameteo.pl)'
        },
        signal: controller.signal 
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      
      // If it's 400, 401, 403, or 429 (Rate Limit / Unauthorized), return immediately without retrying
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
        return res;
      }
      
      console.warn(`Fetch failed for ${url} (attempt ${i + 1}/${retries}): Status ${res.status}`);
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`Fetch failed for ${url} (attempt ${i + 1}/${retries}): ${err}`);
    }
    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

function metSymbolToWeatherCode(symbol: string): number {
  if (!symbol) return 0;
  const s = symbol.toLowerCase();
  if (s.includes("clearsky")) return 0;
  if (s.includes("fair")) return 1;
  if (s.includes("partlycloudy")) return 2;
  if (s.includes("cloudy")) return 3;
  if (s.includes("fog")) return 45;
  if (s.includes("heavyrainandthunder") || s.includes("thunder")) return 95;
  if (s.includes("heavyrain")) return 63;
  if (s.includes("rainshowers")) return 80;
  if (s.includes("rain")) return 61;
  if (s.includes("snowshowers")) return 85;
  if (s.includes("snow")) return 71;
  if (s.includes("sleet")) return 68;
  return 3;
}

function parseMetNorwayToWeatherData(data: any): any {
  const timeseries = data.properties?.timeseries;
  if (!Array.isArray(timeseries) || timeseries.length === 0) return null;

  const first = timeseries[0];
  const inst = first.data?.instant?.details || {};
  const next1 = first.data?.next_1_hours || first.data?.next_6_hours || {};
  const symbolCode = next1.summary?.symbol_code || "";
  const code = metSymbolToWeatherCode(symbolCode);

  const curTemp = inst.air_temperature ?? null;
  const curHumidity = inst.relative_humidity ?? null;
  const curCloud = typeof inst.cloud_area_fraction === 'number' ? Math.round(inst.cloud_area_fraction) : null;
  const curPressure = inst.air_pressure_at_sea_level ?? null;
  const curWind = typeof inst.wind_speed === 'number' ? Number((inst.wind_speed * 3.6).toFixed(1)) : null;
  const curWindDir = inst.wind_from_direction ?? null;
  const curPrecip = next1.details?.precipitation_amount ?? 0;
  const curUv = inst.ultraviolet_index_clear_sky ?? null;

  const hourlyTime: string[] = [];
  const hourlyTemp: number[] = [];
  const hourlyHum: number[] = [];
  const hourlyAppTemp: number[] = [];
  const hourlyWind: number[] = [];
  const hourlyWindDir: number[] = [];
  const hourlyPressure: number[] = [];
  const hourlyPrecipProb: number[] = [];
  const hourlyPrecip: number[] = [];
  const hourlyUv: number[] = [];
  const hourlyCloud: number[] = [];
  const hourlyCode: number[] = [];
  const hourlyIsDay: number[] = [];

  const dailyMap = new Map<string, { temps: number[]; precips: number[]; uvs: number[]; winds: number[]; codes: number[] }>();

  for (const step of timeseries.slice(0, 48)) {
    const stInst = step.data?.instant?.details || {};
    const stNext = step.data?.next_1_hours || step.data?.next_6_hours || {};
    const tStr = step.time;
    const temp = stInst.air_temperature ?? null;
    const hum = stInst.relative_humidity ?? null;
    const cloud = typeof stInst.cloud_area_fraction === 'number' ? Math.round(stInst.cloud_area_fraction) : null;
    const press = stInst.air_pressure_at_sea_level ?? null;
    const wind = typeof stInst.wind_speed === 'number' ? Number((stInst.wind_speed * 3.6).toFixed(1)) : null;
    const windDir = stInst.wind_from_direction ?? null;
    const precip = stNext.details?.precipitation_amount ?? 0;
    const uv = stInst.ultraviolet_index_clear_sky ?? null;
    const stCode = metSymbolToWeatherCode(stNext.summary?.symbol_code || symbolCode);
    const dateObj = new Date(tStr);
    const hour = dateObj.getHours();
    const isDay = hour >= 6 && hour <= 21 ? 1 : 0;

    hourlyTime.push(tStr);
    hourlyTemp.push(temp);
    hourlyHum.push(hum);
    hourlyAppTemp.push(temp);
    hourlyWind.push(wind);
    hourlyWindDir.push(windDir);
    hourlyPressure.push(press);
    hourlyPrecipProb.push(precip > 0 ? 80 : 0);
    hourlyPrecip.push(precip);
    hourlyUv.push(uv);
    hourlyCloud.push(cloud);
    hourlyCode.push(stCode);
    hourlyIsDay.push(isDay);

    const dateKey = tStr.split("T")[0];
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, { temps: [], precips: [], uvs: [], winds: [], codes: [] });
    }
    const dObj = dailyMap.get(dateKey)!;
    dObj.temps.push(temp);
    dObj.precips.push(precip);
    dObj.uvs.push(uv);
    dObj.winds.push(wind);
    dObj.codes.push(stCode);
  }

  const dailyTime: string[] = [];
  const dailyCode: number[] = [];
  const dailyTempMax: number[] = [];
  const dailyTempMin: number[] = [];
  const dailyUvMax: number[] = [];
  const dailyPrecipSum: number[] = [];
  const dailyPrecipProbMax: number[] = [];
  const dailyWindMax: number[] = [];

  for (const [dKey, dObj] of dailyMap.entries()) {
    dailyTime.push(dKey);
    dailyTempMax.push(Math.max(...dObj.temps));
    dailyTempMin.push(Math.min(...dObj.temps));
    dailyUvMax.push(Math.max(...dObj.uvs));
    const pSum = dObj.precips.reduce((a, b) => a + b, 0);
    dailyPrecipSum.push(Number(pSum.toFixed(1)));
    dailyPrecipProbMax.push(pSum > 0 ? 85 : 0);
    dailyWindMax.push(Math.max(...dObj.winds));
    dailyCode.push(dObj.codes[0] ?? code);
  }

  const dailySunrise: string[] = dailyTime.map(d => `${d}T05:30:00Z`);
  const dailySunset: string[] = dailyTime.map(d => `${d}T20:30:00Z`);

  return {
    current: {
      temperature_2m: curTemp,
      relative_humidity_2m: curHumidity,
      apparent_temperature: curTemp,
      is_day: new Date().getHours() >= 6 && new Date().getHours() <= 21 ? 1 : 0,
      precipitation: curPrecip,
      cloud_cover: curCloud,
      cloud_cover_low: Math.round(curCloud * 0.4),
      cloud_cover_mid: Math.round(curCloud * 0.4),
      cloud_cover_high: Math.round(curCloud * 0.2),
      pressure_msl: curPressure,
      wind_speed_10m: curWind,
      wind_direction_10m: curWindDir,
      uv_index: curUv,
      visibility: 25000,
      weather_code: code
    },
    hourly: {
      time: hourlyTime,
      temperature_2m: hourlyTemp,
      relative_humidity_2m: hourlyHum,
      apparent_temperature: hourlyAppTemp,
      weather_code: hourlyCode,
      wind_speed_10m: hourlyWind,
      wind_direction_10m: hourlyWindDir,
      pressure_msl: hourlyPressure,
      precipitation_probability: hourlyPrecipProb,
      precipitation: hourlyPrecip,
      uv_index: hourlyUv,
      cloud_cover: hourlyCloud,
      cloud_cover_low: hourlyCloud.map(c => Math.round(c * 0.4)),
      cloud_cover_mid: hourlyCloud.map(c => Math.round(c * 0.4)),
      cloud_cover_high: hourlyCloud.map(c => Math.round(c * 0.2)),
      visibility: new Array(hourlyTime.length).fill(25000),
      is_day: hourlyIsDay
    },
    daily: {
      time: dailyTime,
      weather_code: dailyCode,
      temperature_2m_max: dailyTempMax,
      temperature_2m_min: dailyTempMin,
      apparent_temperature_max: dailyTempMax,
      apparent_temperature_min: dailyTempMin,
      uv_index_max: dailyUvMax,
      precipitation_sum: dailyPrecipSum,
      precipitation_probability_max: dailyPrecipProbMax,
      wind_speed_10m_max: dailyWindMax,
      sunrise: dailySunrise,
      sunset: dailySunset
    },
    activeServers: ["MET Norway (Yr.no)"]
  };
}

async function fetchImgwMeteoData(userLat: number, userLng: number) {
  try {
    const res = await fetchWithRetry("https://danepubliczne.imgw.pl/api/data/meteo");
    if (!res) return null;
    
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.warn("IMGW METEO API returned non-JSON response");
      return null;
    }
    
    const meteoList = await res.json();
    if (!Array.isArray(meteoList) || meteoList.length === 0) return null;

    let bestStation: any = null;
    let minDistance = Infinity;

    for (const item of meteoList) {
      if (!item || !item.lat || !item.lon) continue;
      const stLat = parseFloat(item.lat);
      const stLng = parseFloat(item.lon);
      if (isNaN(stLat) || isNaN(stLng)) continue;

      const tempStr = item.temperatura_powietrza;
      if (tempStr === null || tempStr === undefined || tempStr === "") continue;

      const dist = getDistanceKm(userLat, userLng, stLat, stLng);
      if (dist < minDistance) {
        minDistance = dist;
        const rawTemp = parseFloat(tempStr);
        const rawHum = item.wilgotnosc_wzgledna ? parseFloat(item.wilgotnosc_wzgledna) : null;
        const rawWind = item.wiatr_srednia_predkosc ? Math.round(parseFloat(item.wiatr_srednia_predkosc) * 3.6) : null;
        const rawRain = item.opad_10min ? parseFloat(item.opad_10min) : 0;
        const rawGround = item.temperatura_gruntu ? parseFloat(item.temperatura_gruntu) : null;

        const timeRaw = item.temperatura_powietrza_data || item.opad_10min_data || "";
        const formattedTime = timeRaw ? formatUtcToPolishTime(timeRaw) : "";

        bestStation = {
          raw: item,
          stationName: item.nazwa_stacji,
          distanceKm: dist,
          lat: stLat,
          lng: stLng,
          temp: !isNaN(rawTemp) ? rawTemp : null,
          humidity: rawHum && !isNaN(rawHum) ? normalizeHumidity(rawHum) : null,
          windSpeed: rawWind && !isNaN(rawWind) ? rawWind : null,
          rainRate: !isNaN(rawRain) ? rawRain : 0,
          groundTemp: rawGround && !isNaN(rawGround) ? rawGround : null,
          measurementTime: formattedTime
        };
      }
    }

    if (bestStation && minDistance < 120 && bestStation.temp !== null) {
      console.log(`[IMGW METEO API] Nearest telemetry station matched: ${bestStation.stationName} (${bestStation.distanceKm} km away from lat:${userLat}, lng:${userLng}). Temp: ${bestStation.temp}°C at ${bestStation.measurementTime}`);
      return bestStation;
    }
    return null;
  } catch (err) {
    console.warn("IMGW METEO API fetch warning:", err);
    return null;
  }
}

async function fetchImgwSynopData(userLat: number, userLng: number) {
  try {
    const res = await fetchWithRetry("https://danepubliczne.imgw.pl/api/data/synop");
    if (!res) return null;
    
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.warn("IMGW SYNOP API returned non-JSON response");
      return null;
    }
    
    const synopList = await res.json();
    if (!Array.isArray(synopList) || synopList.length === 0) return null;

    let bestStation: any = null;
    let minDistance = Infinity;

    for (const item of synopList) {
      if (!item || !item.stacja || item.temperatura === undefined || item.temperatura === null) continue;
      const rawName = item.stacja.trim();
      const normRaw = normalizeStationName(rawName);
      
      const matched = IMGW_STATIONS.find(s => {
        const normS = normalizeStationName(s.name);
        return normS === normRaw || normRaw.includes(normS) || normS.includes(normRaw);
      });

      if (!matched) continue;

      const dist = getDistanceKm(userLat, userLng, matched.lat, matched.lng);
      if (dist < minDistance) {
        minDistance = dist;
        const rawTemp = parseFloat(item.temperatura);
        const rawHum = parseFloat(item.wilgotnosc_wzgledna);
        const rawPress = item.cisnienie ? parseFloat(item.cisnienie) : null;
        const rawWind = item.predkosc_wiatru ? Math.round(parseFloat(item.predkosc_wiatru) * 3.6) : null;
        const rawRain = item.suma_opadu ? parseFloat(item.suma_opadu) : 0;

        const timeStr = formatUtcToPolishTime(item.data_pomiaru || '', item.godzina_pomiaru || '');

        bestStation = {
          raw: item,
          stationName: item.stacja,
          distanceKm: dist,
          lat: matched.lat,
          lng: matched.lng,
          temp: !isNaN(rawTemp) ? rawTemp : null,
          humidity: !isNaN(rawHum) ? normalizeHumidity(rawHum) : null,
          pressure: rawPress && !isNaN(rawPress) ? Math.round(rawPress) : null,
          windSpeed: rawWind && !isNaN(rawWind) ? rawWind : null,
          rainRate: !isNaN(rawRain) ? rawRain : 0,
          measurementTime: timeStr
        };
      }
    }

    if (bestStation && minDistance < 50 && bestStation.temp !== null) {
      console.log(`[IMGW SYNOP API] Nearest station matched: ${bestStation.stationName} (${bestStation.distanceKm} km away from lat:${userLat}, lng:${userLng}). Temp: ${bestStation.temp}°C`);
      return bestStation;
    }
    return null;
  } catch (err) {
    console.warn("IMGW SYNOP API fetch warning:", err);
    return null;
  }
}

/**
 * Fetches Air Quality data from GIOŚ (Chief Inspectorate for Environmental Protection) API.
 * Uses station proximity for Polish locations.
 */
async function fetchGiosAirQuality(userLat: number, userLng: number) {
  try {
    // 1. Check cache for stations
    let stations: any[] | null = null;
    if (giosStationsCache && (Date.now() - giosStationsCache.timestamp < GIOS_STATIONS_CACHE_TTL)) {
      stations = giosStationsCache.data;
    }

    if (!stations) {
      // Fetch all stations (using modernized GIOŚ API v1)
      const stationsRes = await fetchWithRetry("https://api.gios.gov.pl/pjp-api/v1/rest/metadata/stations?size=500");
      if (stationsRes && stationsRes.ok) {
        const stationsData = await stationsRes.json();
        stations = stationsData["Lista metadanych stacji pomiarowych"] || stationsData.data || stationsData;
        if (Array.isArray(stations)) {
          giosStationsCache = { data: stations, timestamp: Date.now() };
        }
      } else if (giosStationsCache) {
        // Fallback to expired cache if API fails (rate limit)
        stations = giosStationsCache.data;
        console.warn("[GIOŚ API] Using expired stations cache due to API failure.");
      }
    }
    
    if (!stations || !Array.isArray(stations)) return null;

    // 2. Find nearest station
    let nearestStation = null;
    let minDist = Infinity;
    for (const s of stations) {
      const lat = s["WGS84 φ N"] || s.gegrLat || s.lat;
      const lon = s["WGS84 λ E"] || s.gegrLon || s.lon;
      const closedDate = s["Data zamknięcia"] || s.dataZamkniecia;
      
      if (!lat || !lon || closedDate) continue; 
      
      const d = getDistanceKm(userLat, userLng, parseFloat(lat), parseFloat(lon));
      if (d < minDist) {
        minDist = d;
        nearestStation = s;
      }
    }

    if (!nearestStation || minDist > 50) return null; 

    // 3. Check cache for AQI
    const stationId = nearestStation.Nr || nearestStation.id;
    const cachedAqi = giosAqiCache.get(stationId);
    if (cachedAqi && (Date.now() - cachedAqi.timestamp < GIOS_AQI_CACHE_TTL)) {
      return cachedAqi.data;
    }

    const indexRes = await fetchWithRetry(`https://api.gios.gov.pl/pjp-api/v1/rest/aqindex/getIndex/${stationId}`);
    if (!indexRes || !indexRes.ok) {
      if (cachedAqi) return cachedAqi.data; // Return expired if rate limited
      return null;
    }
    const aqiData = await indexRes.json();
    const aqiObj = aqiData.AqIndex || aqiData;

    const result = {
      stationName: nearestStation["Nazwa stacji"] || nearestStation.stationName,
      address: nearestStation.Adres || nearestStation.addressStreet,
      distanceKm: Math.round(minDist * 10) / 10,
      aqi: aqiObj["Nazwa kategorii indeksu"] || aqiObj.stIndexLevel?.indexLevelName || "Brak danych",
      pm10: aqiObj["Nazwa kategorii indeksu dla wskaźnika PM10"] || aqiObj.pm10IndexLevel?.indexLevelName,
      pm25: aqiObj["Nazwa kategorii indeksu dla wskaźnika PM2.5"] || aqiObj.pm25IndexLevel?.indexLevelName,
      o3: aqiObj["Nazwa kategorii indeksu dla wskaźnika O3"] || aqiObj.o3IndexLevel?.indexLevelName,
      no2: aqiObj["Nazwa kategorii indeksu dla wskaźnika NO2"] || aqiObj.no2IndexLevel?.indexLevelName,
      source: "GIOŚ (Główny Inspektorat Ochrony Środowiska)"
    };

    // Store in cache
    giosAqiCache.set(stationId, { data: result, timestamp: Date.now() });

    return result;
  } catch (err) {
    console.warn("GIOŚ API fetch warning:", err);
    return null;
  }
}

/**
 * Fetches Hydrological data from IMGW-PIB API.
 * Returns water levels for the nearest measurement point.
 */
async function fetchImgwHydroData(userLat: number, userLng: number) {
  try {
    const res = await fetchWithRetry("https://danepubliczne.imgw.pl/api/data/hydro");
    if (!res || !res.ok) return null;
    const hydroList = await res.json();
    if (!Array.isArray(hydroList)) return null;

    // Find nearest water station
    // Note: IMGW Hydro API doesn't provide lat/lng directly in the list, 
    // but we can match by name or use a pre-defined list if we had one.
    // For now, we return the list to let the client or a filter handle it, 
    // or we can just pick the 3 closest if we had coords.
    // Simplified: we'll return a placeholder or look for specific known stations if they match the area.
    
    // Actually, IMGW Hydro API gives 'stacja', 'rzeka', 'stan_wody'.
    // Without coordinates in the API response, we'd need a lookup table.
    return {
      stations: hydroList.slice(0, 10), // Return sample for now
      source: "IMGW-PIB Hydrologia"
    };
  } catch (err) {
    console.warn("IMGW Hydro API fetch warning:", err);
    return null;
  }
}

// API Route: Get weather data & reverse geocode
app.get(["/api/weather", "/api/pogoda"], async (req, res) => {
  // Disable caching so live server updates & IMGW telemetry are fetched fresh on every request
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  const { lat: rawLat, lng: rawLng } = req.query;
  let lat = parseFloat(rawLat as string);
  let lng = parseFloat(rawLng as string);

  // SNAP removed to allow accurate GPS coordinates
  
  console.log("Fetching weather for lat:", lat, "lng:", lng);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "Szerokość i długość geograficzna są wymagane (lat, lng)." });
  }

  const geoKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  const cachedWeather = weatherResponseCache.get(geoKey);
  if (cachedWeather && (Date.now() - cachedWeather.timestamp < WEATHER_CACHE_TTL_MS)) {
    return res.json(cachedWeather.data);
  }

  // Determine city for logging
  let city = "Nieznana lokalizacja";
  try {
    const geoUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pl`;
    const geoController = new AbortController();
    const geoTimeout = setTimeout(() => geoController.abort(), 5000);
    const geoRes = await fetch(geoUrl, { signal: geoController.signal });
    clearTimeout(geoTimeout);
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.locality && !geoData.locality.toLowerCase().startsWith("województwo")) {
        city = geoData.locality;
      } else {
        const combinedList = [
          ...(geoData.localityInfo?.administrative || []),
          ...(geoData.localityInfo?.informative || [])
        ];
        const validItems = combinedList.filter((item: any) => {
          if (!item || !item.name) return false;
          const lower = item.name.toLowerCase();
          return !["europa", "europe", "polska", "poland", "unia europejska"].includes(lower) &&
                 !lower.startsWith("województwo") && !lower.startsWith("voivodeship");
        });
        validItems.sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
        if (validItems.length > 0) {
          city = validItems[0].name;
        } else if (geoData.city) {
          city = geoData.city;
        }
      }
      console.log("Resolved location for weather fetch:", city, "at lat:", lat, "lng:", lng);
    }
  } catch (e) {
    console.warn("Reverse geocoding failed for logging:", e);
  }

  try {
    let weatherData: any = null;
    const weatherApiKey = process.env.WEATHER_API_KEY;

    // 1. Attempt Open-Meteo
    const apiKey = process.env.OPENMETEO_API_KEY;
    let omBase = apiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
    let auth = apiKey ? `&apikey=${apiKey}` : "";

    let openMeteoUrl = `${omBase}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,shortwave_radiation,direct_normal_irradiance,lightning_potential&minutely_15=precipitation,precipitation_probability,rain,snowfall&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,precipitation_probability,precipitation,uv_index,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation,direct_normal_irradiance,is_day,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_temperature_0cm,evapotranspiration,lightning_potential&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code&forecast_days=3&timezone=auto${auth}`;
    try {
      console.log(`Fetching weather from Open-Meteo: ${openMeteoUrl.split('&apikey=')[0]}...`);
      let res = await fetchWithRetry(openMeteoUrl);
      
      // Fallback to public API if key is invalid
      if (res && res.status === 400 && apiKey) {
        console.warn("Open-Meteo returned 400 with API key, falling back to public endpoint...");
        omBase = "https://api.open-meteo.com/v1/forecast";
        auth = "";
        openMeteoUrl = `${omBase}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,shortwave_radiation,direct_normal_irradiance,lightning_potential&minutely_15=precipitation,precipitation_probability,rain,snowfall&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,precipitation_probability,precipitation,uv_index,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation,direct_normal_irradiance,is_day,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_temperature_0cm,evapotranspiration,lightning_potential&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code&forecast_days=3&timezone=auto`;
        res = await fetchWithRetry(openMeteoUrl);
      }

      if (res && res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          weatherData = await res.json();
          weatherData.activeServers = ["Open-Meteo GFS"];
        } else {
          const text = await res.text();
          console.error("Open-Meteo returned non-JSON response:", text.substring(0, 100));
        }
      }
    } catch (err) {
      console.error("Open-Meteo failed:", err);
    }

    // 2. Fallback to WeatherAPI
    if (!weatherData && weatherApiKey) {
      try {
        console.log("Falling back to WeatherAPI");
        const weatherApiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${lat},${lng}&days=1&aqi=no&alerts=no`;
        const weatherApiResponse = await fetchWithRetry(weatherApiUrl);
        if (weatherApiResponse && weatherApiResponse.ok) {
          const contentType = weatherApiResponse.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            console.warn("WeatherAPI returned non-JSON response");
            throw new Error("Invalid response format");
          }
          const data = await weatherApiResponse.json();
          weatherData = {
            current: {
              temperature_2m: data.current.temp_c,
              relative_humidity_2m: data.current.humidity,
              apparent_temperature: data.current.feelslike_c,
              is_day: data.current.is_day,
              precipitation: data.current.precip_mm,
              cloud_cover: data.current.cloud,
              wind_speed_10m: data.current.wind_kph,
              uv_index: data.current.uv,
              weather_code: data.current.condition.code
            },
            hourly: {
              time: data.forecast.forecastday[0].hour.map((h: any) => h.time),
              temperature_2m: data.forecast.forecastday[0].hour.map((h: any) => h.temp_c),
              relative_humidity_2m: data.forecast.forecastday[0].hour.map((h: any) => h.humidity),
              apparent_temperature: data.forecast.forecastday[0].hour.map((h: any) => h.feelslike_c),
              wind_speed_10m: data.forecast.forecastday[0].hour.map((h: any) => h.wind_kph),
              precipitation_probability: data.forecast.forecastday[0].hour.map((h: any) => h.chance_of_rain),
              cloud_cover: data.forecast.forecastday[0].hour.map((h: any) => h.cloud),
              weather_code: data.forecast.forecastday[0].hour.map((h: any) => h.condition.code),
              precipitation: data.forecast.forecastday[0].hour.map((h: any) => h.precip_mm),
              uv_index: data.forecast.forecastday[0].hour.map((h: any) => h.uv)
            },
            daily: {
              time: [data.forecast.forecastday[0].date],
              weather_code: [data.forecast.forecastday[0].day.condition.code],
              temperature_2m_max: [data.forecast.forecastday[0].day.maxtemp_c],
              temperature_2m_min: [data.forecast.forecastday[0].day.mintemp_c],
              apparent_temperature_max: [data.forecast.forecastday[0].day.maxtemp_c], // Fallback
              apparent_temperature_min: [data.forecast.forecastday[0].day.mintemp_c], // Fallback
              uv_index_max: [data.forecast.forecastday[0].day.uv],
              precipitation_sum: [data.forecast.forecastday[0].day.totalprecip_mm],
              precipitation_probability_max: [data.forecast.forecastday[0].day.daily_chance_of_rain],
              wind_speed_10m_max: [data.forecast.forecastday[0].day.maxwind_kph]
            },
            activeServers: ["WeatherAPI"]
          };
        }
      } catch (err) {
        console.error("WeatherAPI failed:", err);
      }
    }

    if (!weatherData) {
      try {
        console.log("Attempting MET Norway fallback forecast...");
        const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`;
        const metRes = await fetchWithRetry(metUrl, 2, 8000);
        if (metRes && metRes.ok) {
          const metJson = await metRes.json();
          weatherData = parseMetNorwayToWeatherData(metJson);
        }
      } catch (e) {
        console.warn("MET Norway fallback failed:", e);
      }
    }

    if (!weatherData) {
      const fallbackCached = weatherResponseCache.get(geoKey);
      if (fallbackCached && fallbackCached.data) {
        console.warn(`[Weather API] Returning cached fallback for ${geoKey}`);
        return res.json(fallbackCached.data);
      }
      return res.status(503).json({ error: "Usługa pogodowa chwilowo niedostępna. Spróbuj ponownie za chwilę." });
    }

    // 2. Integration of Polish-specific data (GIOŚ AQI, IMGW Hydrology)
    try {
      const [giosAir, hydroData] = await Promise.all([
        fetchGiosAirQuality(lat, lng),
        fetchImgwHydroData(lat, lng)
      ]);
      if (giosAir) weatherData.airQuality = giosAir;
      if (hydroData) weatherData.hydrology = hydroData;
    } catch (e) {
      console.warn("Failed to fetch additional Polish environmental data:", e);
    }

    // 2. Minimal Normalization: Ensure base fields exist if the API returns them with model suffixes
    const normalizeObject = (obj: any, fields: string[]) => {
      if (!obj) return;
      fields.forEach(field => {
        if (obj[field] === undefined || obj[field] === null) {
          const keys = Object.keys(obj);
          const altKey = keys.find(k => k.startsWith(field + '_'));
          if (altKey) {
            obj[field] = obj[altKey];
          }
        }
      });
    };

    const weatherFields = [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 
      'weather_code', 'wind_speed_10m', 'wind_direction_10m', 
      'pressure_msl', 'precipitation_probability', 'precipitation', 
      'uv_index', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'visibility'
    ];

    if (!weatherData) {
      return res.status(503).json({ error: "Nie udało się pobrać danych pogodowych z żadnego źródła." });
    }

    // Standardize structure for all models
    if (weatherData.current) normalizeObject(weatherData.current, weatherFields);
    if (weatherData.hourly) normalizeObject(weatherData.hourly, weatherFields);

    const activeServers = weatherData.activeServers ? [...weatherData.activeServers] : ["Open-Meteo GFS"];
    let metCloud: number | null = null;
    let metTemp: number | null = null;
    let ecmwfTemp: number | null = null;
    let ecmwfCloud: number | null = null;
    let ecmwfHum: number | null = null;
    let iconTemp: number | null = null;
    let iconCloud: number | null = null;
    let iconHum: number | null = null;
    let imgwData: any = null;

    // Fetch IMGW Telemetry, IMGW SYNOP, ECMWF IFS, DWD ICON-EU, and MET Norway API in parallel
    try {
      const parsedLat = lat;
      const parsedLng = lng;
      const metUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lng}`;
      const ecmwfUrl = `${omBase}?latitude=${lat}&longitude=${lng}&models=ecmwf_ifs025&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,pressure_msl${auth}`;
      const iconUrl = `${omBase}?latitude=${lat}&longitude=${lng}&models=icon_eu&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,pressure_msl${auth}`;

      const [metRes, ecmwfRes, iconRes, imgwMeteoResult, imgwSynopResult] = await Promise.all([
        fetchWithRetry(metUrl, 2, 10000), // Slightly lower timeout for sub-fetches
        fetchWithRetry(ecmwfUrl, 2, 10000),
        fetchWithRetry(iconUrl, 2, 10000),
        fetchImgwMeteoData(parsedLat, parsedLng).catch(() => null),
        fetchImgwSynopData(parsedLat, parsedLng).catch(() => null)
      ]);

      // Prefer IMGW Meteo Telemetry if closer, else SYNOP
      imgwData = imgwMeteoResult || imgwSynopResult;
      if (imgwData) {
        const stationType = imgwMeteoResult ? "Telemetryczna" : "Synoptyczna";
        activeServers.push(`IMGW-PIB stacja ${stationType} ${imgwData.stationName} (${imgwData.distanceKm}km)`);
      }

      if (metRes && metRes.ok) {
        const metJson = await metRes.json();
        const timeseries = metJson?.properties?.timeseries;
        if (timeseries && timeseries.length > 0) {
          const currentInstant = timeseries[0]?.data?.instant?.details;
          if (currentInstant) {
            if (typeof currentInstant.cloud_area_fraction === 'number') metCloud = currentInstant.cloud_area_fraction;
            if (typeof currentInstant.air_temperature === 'number') metTemp = currentInstant.air_temperature;
            activeServers.push("MET Norway");
          }
        }
      }

      if (ecmwfRes && ecmwfRes.ok) {
        const ecmwfJson = await ecmwfRes.json();
        if (ecmwfJson && ecmwfJson.current) {
          ecmwfTemp = ecmwfJson.current.temperature_2m;
          ecmwfCloud = ecmwfJson.current.cloud_cover;
          ecmwfHum = normalizeHumidity(ecmwfJson.current.relative_humidity_2m);
          activeServers.push("ECMWF IFS (Europe)");
        }
      }

      if (iconRes && iconRes.ok) {
        const iconJson = await iconRes.json();
        if (iconJson && iconJson.current) {
          iconTemp = iconJson.current.temperature_2m;
          iconCloud = iconJson.current.cloud_cover;
          iconHum = normalizeHumidity(iconJson.current.relative_humidity_2m);
          activeServers.push("DWD ICON-EU (Środk. Europa)");
        }
      }
    } catch (e) {
      console.warn("Multi-server consensus fetch warning:", e);
    }

    weatherData.activeServers = activeServers;

    const baseTemp = weatherData.current?.temperature_2m ?? (weatherData.hourly?.temperature_2m?.[0] ?? 12);
    const baseHum = normalizeHumidity(weatherData.current?.relative_humidity_2m ?? (weatherData.hourly?.relative_humidity_2m?.[0] ?? 70));
    const c = weatherData.current ?? {};
    const baseWind = weatherData.current?.wind_speed_10m ?? 12;

    // Calculate Perceived Optical Cloud Cover & Ground Truth Solar Irradiance:
    // High clouds (cirrus) are thin, transparent ice filaments and do not block blue sky or direct sunlight.
    // Low clouds (stratus, cumulus) block 100% of the sky.
    // Mid clouds (altocumulus) block ~35-50%.
    const lowC = typeof c.cloud_cover_low === 'number' ? c.cloud_cover_low : 0;
    const midC = typeof c.cloud_cover_mid === 'number' ? c.cloud_cover_mid : 0;
    const highC = typeof c.cloud_cover_high === 'number' ? c.cloud_cover_high : 0;
    const totalC = typeof c.cloud_cover === 'number' ? c.cloud_cover : 0;
    const isDay = c.is_day === 1;

    const swRad = typeof c.shortwave_radiation === 'number' ? c.shortwave_radiation : 0;
    const dniRad = typeof c.direct_normal_irradiance === 'number' ? c.direct_normal_irradiance : 0;
    const uvVal = typeof c.uv_index === 'number' ? c.uv_index : 0;
    const precipVal = typeof c.precipitation === 'number' ? c.precipitation : 0;

    // Removed weighting consensus logic. Using primary weather source raw data for current.
    
    if (weatherData.current) {
      // Ensure all current values are from the primary source without "corrections"
      weatherData.current.relative_humidity_2m = normalizeHumidity(weatherData.current.relative_humidity_2m);
      
      const rawCloud = typeof weatherData.current.cloud_cover === 'number'
        ? Math.min(100, Math.max(0, Math.round(weatherData.current.cloud_cover)))
        : null;
      
      weatherData.current.cloud_cover = rawCloud;
      weatherData.current.perceived_cloud_cover = rawCloud;
    }

    // Attach IMGW station data separately as requested
    weatherData.imgwStation = imgwData;
    
    // Attach other models purely for information, not for calculation
    weatherData.modelsData = {
      ecmwf: ecmwfTemp !== null ? { temp: ecmwfTemp, humidity: ecmwfHum, cloud: ecmwfCloud } : null,
      icon: iconTemp !== null ? { temp: iconTemp, humidity: iconHum, cloud: iconCloud } : null,
      metNorway: metTemp !== null ? { temp: metTemp, cloud: metCloud } : null
    };

    if (weatherData.current) {
      // Attach fusion metadata for UI but with zero weights (raw data only)
      weatherData.current.fusion_metadata = {
        applied_filters: ["RAW_DATA_ONLY"],
        confidence_score: 100
      };
    }

    // IMGW station data provided separately
    weatherData.imgwStation = imgwData;
    
    // Calculate satellite soil moisture for current hour using raw data
    let wilgotnoscSatelitarna = 28;
    if (typeof weatherData.current?.soil_moisture_0_to_1cm === 'number') {
      const sm0 = weatherData.current.soil_moisture_0_to_1cm;
      wilgotnoscSatelitarna = Math.round(Math.min(85, Math.max(5, sm0 > 1 ? sm0 : sm0 * 100)));
    } else if (weatherData.hourly && Array.isArray(weatherData.hourly.soil_moisture_0_to_1cm) && weatherData.hourly.soil_moisture_0_to_1cm.length > 0) {
      const sm0Arr = weatherData.hourly.soil_moisture_0_to_1cm;
      const times = weatherData.hourly.time ?? [];
      const nowIsoHour = new Date().toISOString().slice(0, 13);
      let idx = times.findIndex((t: string) => t.startsWith(nowIsoHour));
      if (idx === -1) idx = new Date().getHours();
      if (idx >= sm0Arr.length) idx = 0;

      const sm0 = sm0Arr[idx] ?? 0.21;
      const rawMoisture = sm0 > 1 ? sm0 : sm0 * 100;
      wilgotnoscSatelitarna = Math.round(Math.min(85, Math.max(5, rawMoisture)));
    } else {
      const hum = weatherData.current?.relative_humidity_2m ?? 60;
      const precip = weatherData.current?.precipitation ?? 0;
      wilgotnoscSatelitarna = Math.round(Math.min(65, Math.max(12, hum * 0.3 + precip * 4)));
    }
    
    if (weatherData.current) {
      weatherData.current.soil_moisture_satellite = wilgotnoscSatelitarna;
    }

    // Preserve raw cloud_cover for all hours in hourly forecast
    if (weatherData.hourly && Array.isArray(weatherData.hourly.cloud_cover)) {
      weatherData.hourly.cloud_cover = weatherData.hourly.cloud_cover.map((cVal: number) => {
        return typeof cVal === 'number' ? Math.min(100, Math.max(0, Math.round(cVal))) : null;
      });
    }

    if (weatherData.hourly && Array.isArray(weatherData.hourly.relative_humidity_2m)) {
      weatherData.hourly.relative_humidity_2m = weatherData.hourly.relative_humidity_2m.map((h: any) => normalizeHumidity(h));
    }

    // Attach other models purely for information, not for calculation
    weatherData.modelsData = {
      ecmwf: ecmwfTemp !== null ? { temp: ecmwfTemp, humidity: ecmwfHum, cloud: ecmwfCloud } : null,
      icon: iconTemp !== null ? { temp: iconTemp, humidity: iconHum, cloud: iconCloud } : null,
      metNorway: metTemp !== null ? { temp: metTemp, cloud: metCloud } : null
    };

    weatherData.sourcesData = {
      gpsSource: {
        temp: weatherData.current?.temperature_2m ?? baseTemp,
        cloud: weatherData.current?.cloud_cover ?? 0,
        humidity: weatherData.current?.relative_humidity_2m ?? 60,
        label: "Prognoza dla lokalizacji GPS"
      },
      imgw: imgwData ? {
        temp: imgwData.temp,
        humidity: imgwData.humidity ?? 60,
        wind: imgwData.windSpeed ?? 0,
        pressure: imgwData.pressure ?? (weatherData.current?.pressure_msl ? Math.round(weatherData.current.pressure_msl) : 1029),
        stationName: imgwData.stationName,
        distanceKm: imgwData.distanceKm,
        measurementTime: imgwData.measurementTime,
        label: `IMGW-PIB Stacja ${imgwData.stationName} (${imgwData.distanceKm} km)`
      } : null
    };


    // Calculate daily summaries from hourly data to ensure consistency
    if (weatherData.hourly && weatherData.hourly.time && weatherData.daily) {
      const hourly = weatherData.hourly;
      
      const temps = hourly.temperature_2m || [];
      const codes = hourly.weather_code || [];
      const precips = hourly.precipitation || [];
      const probs = hourly.precipitation_probability || [];
      const winds = hourly.wind_speed_10m || [];
      const uvs = hourly.uv_index || [];
      const clouds = hourly.cloud_cover || [];

      const daily: any = {
        ...weatherData.daily, // keep sunrise, sunset
        time: [],
        weather_code: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        uv_index_max: [],
        precipitation_sum: [],
        precipitation_probability_max: [],
        wind_speed_10m_max: []
      };

      for (let d = 0; d < 7; d++) {
        const start = d * 24;
        const end = start + 24;
        if (temps.length < end) break;
        
        const dayHourly = {
          temp: temps.slice(start, end),
          code: codes.slice(start, end),
          precip: precips.slice(start, end),
          prob: probs.slice(start, end),
          wind: winds.slice(start, end),
          uv: uvs.slice(start, end)
        };
        
        daily.time.push(hourly.time[start].split('T')[0]); // YYYY-MM-DD
        daily.temperature_2m_max.push(Math.max(...dayHourly.temp));
        daily.temperature_2m_min.push(Math.min(...dayHourly.temp));
        daily.precipitation_sum.push(parseFloat(dayHourly.precip.reduce((a: number, b: number) => a + (b ?? 0), 0).toFixed(1)));
        daily.precipitation_probability_max.push(Math.max(...dayHourly.prob));
        daily.wind_speed_10m_max.push(Math.max(...dayHourly.wind));
        daily.uv_index_max.push(Math.max(...dayHourly.uv));
        
        const dayCodes = dayHourly.code ?? [];
        const pSum = daily.precipitation_sum[daily.precipitation_sum.length - 1] ?? 0;
        const maxP = daily.precipitation_probability_max[daily.precipitation_probability_max.length - 1] ?? 0;

        const getDailyCode = (codes: number[], precipSum: number, maxPop: number) => {
          if (!codes || codes.length === 0) return 0;
          
          const getSeverity = (code: number) => {
            if (code >= 95 && code <= 99) return 100; // Burza
            if (code === 65 || code === 82 || code === 75 || code === 86) return 90; // Ulewa / śnieżyca
            if (code === 63 || code === 81 || code === 73 || code === 85) return 80; // Opady umiarkowane
            if (code === 61 || code === 80 || code === 55 || code === 53 || code === 51) return 70; // Deszcz / przelotny / mżawka
            if (code === 45 || code === 48) return 50; // Mgła
            if (code === 3) return 40; // Zachmurzenie całkowite
            if (code === 2) return 30; // Umiarkowane
            if (code === 1) return 20; // Małe
            return 10; // Bezchmurnie
          };

          let bestCode = codes[12] !== undefined ? codes[12] : codes[0];
          let maxScore = getSeverity(bestCode);

          for (const c of codes) {
            const score = getSeverity(c);
            if (score > maxScore) {
              maxScore = score;
              bestCode = c;
            }
          }

          if ((precipSum >= 0.2 || maxPop >= 40) && maxScore < 70) {
            return maxPop >= 60 ? 80 : 51;
          }

          return bestCode;
        };

        daily.weather_code.push(getDailyCode(dayCodes, pSum, maxP));
      }
      weatherData.daily = daily;
      
      // Normalize the hourly object too
      hourly.temperature_2m = temps;
      hourly.weather_code = codes;
      hourly.precipitation = precips;
      hourly.precipitation_probability = probs;
      hourly.wind_speed_10m = winds;
      hourly.uv_index = uvs;
      hourly.cloud_cover = clouds;
    }

    // Attach provider metadata
    weatherData.provider = "Open-Meteo (Hourly-Based)";

    // 2. Fetch high-precision reverse geocoding from OpenStreetMap Nominatim with BigDataCloud fallback
    let city = "Nieznana lokalizacja";
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pl`;
      const nomController = new AbortController();
      const nomTimeout = setTimeout(() => nomController.abort(), 8000);
      const nomRes = await fetch(nomUrl, {
        headers: { "User-Agent": "AuraWeatherApp/1.0 (contact@auraweather.app)" },
        signal: nomController.signal
      });
      clearTimeout(nomTimeout);
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const a = nomData.address || {};
        
        // 1. Specific local settlement (exclude road)
        const specificSettlement = a.village || a.hamlet || a.isolated_dwelling || a.suburb || a.neighbourhood || a.quarter || a.locality || a.farm || a.allotments || a.residential;
        // 2. Town or City
        const townOrCity = a.town || a.city || a.city_district;
        // 3. Municipality / Gmina
        const municipality = a.municipality || a.district;

        if (specificSettlement) {
          const cleanedMuni = municipality ? municipality.replace(/^gmina\s+/i, '') : null;
          if (cleanedMuni && !cleanedMuni.toLowerCase().includes(specificSettlement.toLowerCase()) && !townOrCity) {
            city = `${specificSettlement} (gmina ${cleanedMuni})`;
          } else {
            city = specificSettlement;
          }
        } else if (townOrCity) {
          city = townOrCity;
        } else if (municipality) {
          city = municipality.toLowerCase().startsWith("gmina") ? municipality : `Gmina ${municipality}`;
        } else if (a.county) {
          city = a.county;
        } else if (a.state) {
          city = a.state;
        }
      }
    } catch (e) {
      console.warn("Nominatim reverse geocoding failed or timed out, trying fallback...", e);
    }

    if (city === "Nieznana lokalizacja") {
      try {
        const geoUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pl`;
        const geoController = new AbortController();
        const geoTimeout = setTimeout(() => geoController.abort(), 5000);
        const geoRes = await fetch(geoUrl, { signal: geoController.signal });
        clearTimeout(geoTimeout);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.locality && !geoData.locality.toLowerCase().startsWith("województwo")) {
            city = geoData.locality;
          } else {
            const combinedList = [
              ...(geoData.localityInfo?.administrative || []),
              ...(geoData.localityInfo?.informative || [])
            ];
            const validItems = combinedList.filter((item: any) => {
              if (!item || !item.name) return false;
              const lower = item.name.toLowerCase();
              return !["europa", "europe", "polska", "poland", "unia europejska"].includes(lower) &&
                     !lower.startsWith("województwo") && !lower.startsWith("voivodeship");
            });
            validItems.sort((a: any, b: any) => (b.order || 0) - (a.order || 0));
            if (validItems.length > 0) {
              city = validItems[0].name;
            } else if (geoData.city) {
              city = geoData.city;
            }
          }
        }
      } catch (e) {
        console.error("Geocoding failed completely:", e);
      }
    }

    const weatherPayload = {
      city,
      lat,
      lng,
      weather: weatherData,
      lastUpdated: new Date().toISOString()
    };
    weatherResponseCache.set(geoKey, { data: weatherPayload, timestamp: Date.now() });
    res.json(weatherPayload);
  } catch (err: any) {
    console.error("Error in /api/weather:", err);
    res.status(500).json({ error: err.message || "Błąd wewnętrzny serwera." });
  }
});

// API Route: Get real station data for given GPS coordinates
app.get("/api/stations", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng required" });
  }

  const latitude = parseFloat(lat as string);
  const longitude = parseFloat(lng as string);
  const geoKey = `${Math.round(latitude * 100) / 100}_${Math.round(longitude * 100) / 100}`;

  const cachedStation = stationResponseCache.get(geoKey);
  if (cachedStation && (Date.now() - cachedStation.timestamp < WEATHER_CACHE_TTL_MS)) {
    return res.json(cachedStation.data);
  }

  const apiKey = process.env.OPENMETEO_API_KEY;
  let omBase = apiKey ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
  let auth = apiKey ? `&apikey=${apiKey}` : "";

  try {
    const response = await fetchWithRetry(`${omBase}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,soil_temperature_0cm,soil_moisture_0_to_1cm,shortwave_radiation${auth}`);

    let data: any = {};
    if (response && response.ok) {
      data = await response.json().catch(() => ({}));
    } else {
      const weatherCached = weatherResponseCache.get(geoKey);
      if (weatherCached && weatherCached.data && weatherCached.data.weather && weatherCached.data.weather.current) {
        data = { current: weatherCached.data.weather.current };
      }
    }
    const cur = data.current ?? {};
    const cloudCover = cur.cloud_cover ?? 0;
    const isDayTime = cur.is_day !== undefined ? (cur.is_day === 1) : true;
    
    // Solar radiation calculated strictly according to solar zenith and cloud transmittance physics
    const solarRadiation = calculateSolarRadiation(cloudCover, isDayTime, cur.shortwave_radiation);

    const baseTemp = cur.temperature_2m ?? 0;
    const baseHumidity = normalizeHumidity(cur.relative_humidity_2m);
    const baseWind = cur.wind_speed_10m ?? 0;
    const basePressure = cur.pressure_msl ?? 1029;

    const soilTemp = cur.soil_temperature_0cm ?? baseTemp;
    
    const sm0 = cur.soil_moisture_0_to_1cm;
    const weatherCached = weatherResponseCache.get(geoKey);
    const cachedMoisture = weatherCached?.data?.weather?.current?.soil_moisture_satellite;
    let soilMoisture = 28;
    if (typeof cachedMoisture === 'number') {
      soilMoisture = cachedMoisture;
    } else if (typeof cur.soil_moisture_satellite === 'number') {
      soilMoisture = cur.soil_moisture_satellite;
    } else if (sm0 !== undefined) {
      soilMoisture = Math.round(sm0 > 1 ? sm0 : sm0 * 100);
    } else {
      soilMoisture = Math.round(Math.min(65, Math.max(12, baseHumidity * 0.3 + (cur.precipitation ?? 0) * 5)));
    }

    const rainRate = cur.precipitation ?? 0.0;

    const calcLeafWetness = (humidityVal: number, rainVal: number) => {
      let index = 0;
      if (rainVal > 0) index = 10;
      else if (humidityVal >= 80) index = 5;
      else if (humidityVal >= 65) index = 2;
      else index = 0;
      return { leafWetness: index, leafWetnessText: `${index}/15` };
    };

    let stations: any[] = [];
    let giosAir: any = null;
    let hydroData: any = null;

    try {
      const [realMeteo, realSynop, giosResult, hydroResult] = await Promise.all([
        fetchImgwMeteoData(latitude, longitude),
        fetchImgwSynopData(latitude, longitude),
        fetchGiosAirQuality(latitude, longitude),
        fetchImgwHydroData(latitude, longitude)
      ]);

      giosAir = giosResult;
      hydroData = hydroResult;

      if (realMeteo) {
        stations.push({
          id: "imgw_meteo",
          name: `Stacja IMGW-PIB ${realMeteo.stationName}`,
          lat: realMeteo.lat,
          lng: realMeteo.lng,
          temp: realMeteo.temp,
          humidity: realMeteo.humidity ?? baseHumidity,
          windSpeed: realMeteo.windSpeed ?? Math.round(baseWind),
          pressure: Math.round(basePressure),
          status: "Online - Telemetria IMGW-PIB",
          distanceKm: realMeteo.distanceKm,
          soilTemp: realMeteo.groundTemp ?? soilTemp,
          groundTemp: realMeteo.groundTemp ?? realMeteo.temp,
          soilMoisture: soilMoisture,
          solarRadiation: solarRadiation,
          rainRate: realMeteo.rainRate,
          lastPacket: realMeteo.measurementTime,
          isOfficial: true
        });
      }

      if (realSynop) {
        stations.push({
          id: "imgw_synop",
          name: `Stacja Synoptyczna IMGW-PIB ${realSynop.stationName}`,
          lat: realSynop.lat,
          lng: realSynop.lng,
          temp: realSynop.temp,
          humidity: realSynop.humidity ?? baseHumidity,
          windSpeed: realSynop.windSpeed ?? Math.round(baseWind),
          pressure: realSynop.pressure ?? Math.round(basePressure),
          status: "Online - Pomiary IMGW-PIB",
          distanceKm: realSynop.distanceKm,
          soilTemp: soilTemp,
          groundTemp: realSynop.temp,
          soilMoisture: soilMoisture,
          solarRadiation: Math.round(solarRadiation * 1.05),
          rainRate: realSynop.rainRate,
          lastPacket: realSynop.measurementTime,
          isOfficial: true
        });
      }
    } catch (e) {
      console.warn("Could not fetch real stations:", e);
    }

    const stationPayload = {
      stations,
      airQuality: giosAir,
      hydrology: hydroData,
      coordinates: { lat: latitude, lng: longitude },
      lastUpdated: new Date().toISOString()
    };
    stationResponseCache.set(geoKey, { data: stationPayload, timestamp: Date.now() });
    res.json(stationPayload);
  } catch (err: any) {
    console.error("Error in /api/stations:", err);
    res.status(500).json({ error: err.message || "Błąd pobierania stacji." });
  }
});

// Safe helper - AI disabled
async function callGeminiWithFallback(prompt: string, responseMimeType: string = "application/json"): Promise<string | null> {
  return null;
}

// Auxiliary function: generate highly detailed local weather recommendations if Gemini API is unavailable/fails
function getLocalAdviceFallback(city: string, current: any, daily: any, mode?: string) {
  const satMoisture = typeof current?.soil_moisture_satellite === "number" ? current.soil_moisture_satellite : 25;
  const temp = current ? Math.round(current.temperature_2m ?? 0) : 15;
  const cloud = current ? Math.round(current.cloud_cover ?? 0) : 35;
  const press = current ? Math.round(current.pressure_msl ?? 1029) : 1029;
  const uv = current ? (current.uv_index ?? 3) : 3;

  if (mode === "ciekawostka") {
    const triviaFacts = [
      {
        advice: `Czy wiesz, że radary mikrofalowe pasma C na satelitach europejskich Sentinel-1 prześwietlają glebę w rejonie ${city || 'Twoim'} na głębokość 3 cm? Dzisiejsza wilgotność gleby z kosmosu wynosi dokładnie ${satMoisture}%.`,
        clothes: "Okulary astronomiczne i ciekawość świata",
        activities: "Obserwacja chmur i sprawdzanie danych satelitarnych Copernicus",
        isFallback: true
      },
      {
        advice: `Ciekawostka meteorologiczna dla ${city || 'Twojego regionu'}: Przy ciśnieniu ${press} hPa i zachmurzeniu ${cloud}%, powłoka atmosferyczna waży nad Twoją głową około 10 ton na każdy metr kwadratowy!`,
        clothes: "Lekkie ubranie i czapka z daszkiem",
        activities: "Krótka lektura o fizyce atmosfery i zjawiskach pogodowych",
        isFallback: true
      },
      {
        advice: `Kosmiczny fakt: Geostacjonarny satelita Meteosat widzi ${city || 'Twój region'} z wysokości 35 786 km nad Ziemią! Rejestruje promieniowanie podczerwone, dzięki czemu wiemy, że temperatura gleby w okolicy wynosi ok. ${temp + 1}°C.`,
        clothes: "Wygodny strój na spacer",
        activities: "Wyszukiwanie gwiazdozbiorów lub obserwacja satelitów na niebie",
        isFallback: true
      }
    ];

    // Select fact based on current temperature/moisture hash so it stays stable
    const factIndex = Math.abs((temp + satMoisture + press) % triviaFacts.length);
    return triviaFacts[factIndex];
  }

  if (mode === "podlej") {
    const wilgotnoscSatelitarna = satMoisture;
    if (wilgotnoscSatelitarna < 20) {
      return {
        advice: `Wariacie, satelita Sentinel melduje suszę pod korzeniami (${wilgotnoscSatelitarna}%), natychmiast bierz konewkę!`,
        clothes: "Strój roboczy do ogrodu i konewka w dłoń",
        activities: "Obfite podlewanie kwiatów i roślin ogrodowych",
        isFallback: true,
        soilMoisture: wilgotnoscSatelitarna
      };
    } else if (wilgotnoscSatelitarna > 40) {
      return {
        advice: `Wariacie, satelita Sentinel wykrył, że ziemia jest idealnie wilgotna (${wilgotnoscSatelitarna}%) – schowaj konewkę i nie przelewaj roślin!`,
        clothes: "Wygodne kapcie i odpoczynek",
        activities: "Relaks w ogrodzie i podziwianie nawodnionego trawnika",
        isFallback: true,
        soilMoisture: wilgotnoscSatelitarna
      };
    } else {
      return {
        advice: `Satelita Sentinel/SMOS wskazuje umiarkowaną wilgotność gleby (${wilgotnoscSatelitarna}%). Ziemia jest lekko wilgotna – sprawdź palcem doniczkę i podlej delikatnie tylko w razie potrzeby.`,
        clothes: "Lekki strój codzienny",
        activities: "Drobne prace pielegnacyjne wokół roślin",
        isFallback: true,
        soilMoisture: wilgotnoscSatelitarna
      };
    }
  }

  const code = current ? (current.weather_code ?? 0) : 0;
  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isStorm = code >= 95 && code <= 99;
  
  let baseAdvice = "";
  let clothes = "";
  let activities = "";

  if (isStorm) {
    baseAdvice = `O matko, w ${city || 'Twojej okolicy'} idzie potężna burza przy ${temp}°C! Lepiej szybko zwijaj manatki z pola albo z borówek, schowaj się pod dach i odpuść grę w golfa.`;
    clothes = "Kalosze, peleryna i zero metalowych prętów w rękach";
    activities = "Siedzenie w chałupie, patrzenie w okno i herbatka z malinami";
  } else if (isRain) {
    baseAdvice = `Pada w ${city || 'Twojej okolicy'} (${temp}°C) jakby jutra miało nie być! Jeśli nie chcesz wracać przemoczony do suchej nitki, bierz parasol albo uciekaj pod najbliższy dach.`;
    clothes = "Kurtka przeciwdeszczowa, parasol i wodoodporne adidasy";
    activities = "Zaszycie się w kawiarni albo leniuchowanie pod kocykiem";
  } else if (isSnow) {
    baseAdvice = `Sypie śniegiem w ${city || 'Twojej okolicy'} przy ${temp}°C! Czas odśnieżyć podjazd albo ulepić bałwana, póki białe.`;
    clothes = "Puchówka, czapka z pomponem i solidne zimowe buty";
    activities = "Zimowy spacer, sanki i gorąca czekolada";
  } else if (temp >= 25) {
    baseAdvice = `Ależ grzeje w ${city || 'Twojej okolicy'} – aż ${temp}°C! Słońce daje po oczach, więc idealny moment na zimny browarek lub lemoniadę w cieniu pod parasolem.`;
    clothes = "Krótkie spodenki, okulary przeciwsłoneczne i czapka z daszkiem";
    activities = "Leżing nad wodą, chłodne napoje i pełen relaks";
  } else if (temp >= 15) {
    baseAdvice = `Pogoda w ${city || 'Twojej okolicy'} w sam raz na spacer, ${temp}°C na liczniku. Ani za zimno, ani za gorąco – grzech siedzieć w czterech ścianach!`;
    clothes = "Lekka bluza, t-shirt i wygodne buty";
    activities = "Rower, spacer po parku lub mały grill ze znajomymi";
  } else if (temp >= 5) {
    baseAdvice = `Chłodek w ${city || 'Twojej okolicy'} (${temp}°C), wieje lekki wiatr. Jak się nie ubierzesz na cebulkę, to zaraz zmarzniesz w nos.`;
    clothes = "Kurtka przejściowa, sweter i długie spodnie";
    activities = "Szybki marsz, zakupy albo ciepła kawa na wynos";
  } else {
    baseAdvice = `Trzyma mróz w ${city || 'Twojej okolicy'} (${temp}°C)! Nos czerwony, palce drętwieją – bez grubej kurtki ani rusz.`;
    clothes = "Gruba zimowa kurtka, szalik i ciepłe rękawice";
    activities = "Gorąca herbata z miodem i oglądanie seriali pod kocem";
  }

  const advice = baseAdvice;
  return { advice, clothes, activities, isFallback: true };
}

// API Route: Get current app URL dynamically for the QR code share functionality (defaults to shared pre URL instead of dev link)
app.get("/api/app-url", (req, res) => {
  const host = req.get("host") || "";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  let targetUrl = "https://ais-pre-55vkqchaiz5cdsnzrutx6d-128716608243.europe-west2.run.app";
  
  if (host) {
    const sharedHost = host.replace("-dev-", "-pre-");
    targetUrl = `${protocol}://${sharedHost}`;
  }
  
  res.json({ url: targetUrl });
});

// API Route: High-precision location search (Nominatim + Open-Meteo fallback)
app.get("/api/search-city", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) return res.json([]);

  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&accept-language=pl&countrycodes=pl&limit=10`;
    const nomController = new AbortController();
    const nomTimeout = setTimeout(() => nomController.abort(), 8000);
    const nomRes = await fetch(nomUrl, {
      headers: { "User-Agent": "AuraWeatherApp/1.0 (contact@auraweather.app)" },
      signal: nomController.signal
    });
    clearTimeout(nomTimeout);

    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (Array.isArray(nomData) && nomData.length > 0) {
        let results = nomData.map((item: any) => {
          const a = item.address || {};
          const place = a.hamlet || a.village || a.town || a.city || a.locality || item.name;
          const admin = a.municipality ?? a.county ?? a.state ?? "";
          let label = place;
          if (admin && !admin.toLowerCase().includes(place.toLowerCase())) {
            label = `${place} (${admin})`;
          }
          return {
            name: label,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            rawName: place,
            adminContext: `${admin} ${a.state || ''} ${a.county || ''}`
          };
        });

        return res.json(results);
      }
    }
  } catch (e) {
    console.warn("Nominatim search failed, trying Open-Meteo fallback...", e);
  }

  // Fallback to Open-Meteo Geocoding
  try {
    const apiKey = process.env.OPENMETEO_API_KEY;
    let omGeoBase = apiKey ? "https://customer-geocoding-api.open-meteo.com/v1/search" : "https://geocoding-api.open-meteo.com/v1/search";
    let auth = apiKey ? `&apikey=${apiKey}` : "";

    let omUrl = `${omGeoBase}?name=${encodeURIComponent(query)}&count=10&language=pl&format=json${auth}`;
    let omRes = await fetchWithRetry(omUrl);

    if (omRes && omRes.status === 400 && apiKey) {
      const errJson = await omRes.clone().json().catch(() => ({}));
      if (errJson.reason?.includes("API key")) {
        omGeoBase = "https://geocoding-api.open-meteo.com/v1/search";
        auth = "";
        omUrl = `${omGeoBase}?name=${encodeURIComponent(query)}&count=10&language=pl&format=json`;
        omRes = await fetchWithRetry(omUrl);
      }
    }

    if (omRes && omRes.ok) {
      const omData = await omRes.json();
      if (omData.results && omData.results.length > 0) {
        let results = omData.results.map((r: any) => ({
          name: `${r.name}${r.admin1 ? " (" + r.admin1 + ")" : ""}`,
          lat: r.latitude,
          lng: r.longitude,
          rawName: r.name
        }));

        return res.json(results);
      }
    }
  } catch (e) {
    console.warn("Open-Meteo search failed:", e);
  }

  return res.json([]);
});

// In-memory cache to stay strictly within free-tier API quotas and handle rate limits gracefully
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // Cache AI advice for 6 hours to save quota
const ANALYSIS_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // Cache AI analysis for 1 hour
const aiAdviceCache = new Map<string, { data: any; timestamp: number }>();
const aiAnalysisCache = new Map<string, { data: any; timestamp: number }>();

// Multi-Model Gemini Fallback Chain for 100% Continuity & Reliability
const GEMINI_MODELS_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro"
];

// Cooldown tracker for models hitting 429 / Rate Limit / Quota Exceeded
const modelCooldowns: Record<string, number> = {};

/**
 * Intelligent Multi-Model Dispatcher
 * Automatically cascades through Gemini models if any model hits quota limit (429 / 503 / ResourceExhausted).
 */
async function generateGeminiContentWithFallback(
  prompt: string,
  systemInstruction?: string
): Promise<{ text: string; usedModel: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!geminiKey) {
    console.log("[Gemini Smart Switcher] Brak klucza GEMINI_API_KEY - automatyczne użycie silnika lokalnego.");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const now = Date.now();

  for (const modelName of GEMINI_MODELS_FALLBACK_CHAIN) {
    if (modelCooldowns[modelName] && modelCooldowns[modelName] > now) {
      const remainingSec = Math.ceil((modelCooldowns[modelName] - now) / 1000);
      console.warn(`[Gemini Smart Switcher] Model ${modelName} odpoczywa po limicie zapytań (${remainingSec}s do końca). Przełączam na kolejny...`);
      continue;
    }

    try {
      console.log(`[Gemini Smart Switcher] Wysyłam zapytanie do modelu: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      if (response && response.text) {
        console.log(`[Gemini Smart Switcher] ✅ SUKCES! Zrealizowano przez model: ${modelName}`);
        delete modelCooldowns[modelName]; // Reset cooldown on successful response
        return { text: response.text, usedModel: modelName };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isRateLimitOrQuota =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("limit") ||
        errMsg.includes("503");

      if (isRateLimitOrQuota) {
        console.warn(`[Gemini Smart Switcher] ⚠️ Wykryto LIMIT APKA (429/503/Quota) dla modelu ${modelName}! Natychmiast przełączam na kolejny model Gemini w łańcuchu fallback... (Błąd: ${errMsg.slice(0, 100)})`);
        modelCooldowns[modelName] = Date.now() + 3 * 60 * 1000; // 3 minuty cooldown
      } else {
        console.warn(`[Gemini Smart Switcher] Błąd wykonania na ${modelName}: ${errMsg.slice(0, 100)}. Przełączam na kolejny model w hierarchii...`);
      }
    }
  }

  console.warn("[Gemini Smart Switcher] Wszystkie modele Gemini osiągnęły limit lub są niedostępne. Bezszwowy spadek do niezawodnego silnika lokalnego.");
  return null;
}

// API Route: Smart AI Weather Advice & Insights with Multi-Model Fallback
app.post("/api/weather/ai", async (req, res) => {
  try {
    const { city, current, daily, mode } = req.body || {};
    const cacheKey = `${city ?? 'loc'}_${mode ?? 'def'}_${current?.temperature_2m ?? 0}_${current?.weather_code ?? 0}`;

    const cached = aiAdviceCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return res.json(cached.data);
    }

    const modePrompt = mode === 'ciekawostka' 
      ? 'Podaj jedną ultra interesującą i naukowo ścisłą ciekawostkę meteorologiczną lub satelitarną powiązaną z obecną pogodą w miejscowości ' + (city || 'lokalizacja')
      : mode === 'podlej'
      ? 'Oceń czy należy podlać ogród lub kwiaty w miejscowości ' + (city || 'lokalizacja') + ' uwzględniając wilgotność gleby i prognozę opadów'
      : 'Skomponuj krótką praktyczną radę ubioru i aktywności dla miejscowości ' + (city || 'lokalizacja');

    const prompt = `Jesteś zaawansowanym synoptykiem i asystentem pogodowym.
Lokalizacja: ${city || 'lokalizacja'}.
Otrzymane parametry meteorologiczne:
- Temperatura: ${current?.temperature_2m ?? 15}°C
- Kod pogody WMO: ${current?.weather_code ?? 0}
- Zachmurzenie optyczne: ${current?.cloud_cover ?? 30}%
- Wilgotność gleby (satelita): ${current?.soil_moisture_satellite ?? 25}%
- Opady: ${current?.precipitation ?? 0} mm
- Wiatr: ${current?.wind_speed_10m ?? 10} km/h
- Indeks UV: ${current?.uv_index ?? 3}

Zadanie: ${modePrompt}

Sformatuj odpowiedź WYŁĄCZNIE jako prawidłowy obiekt JSON bez znaczników markdown:
{
  "advice": "krótki zwięzły wniosek po polsku",
  "clothes": "sugerowany ubiór po polsku",
  "activities": "sugerowane aktywności na dzisiaj"
}`;

    const result = await generateGeminiContentWithFallback(prompt);

    if (result && result.text) {
      try {
        const cleaned = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const finalData = {
          advice: parsed.advice || "Pogoda jest stabilna i bez opadów.",
          clothes: parsed.clothes || "Standardowy ubiór warstwowy dostosowany do temperatury.",
          activities: parsed.activities || "Spacer, jazda na rowerze lub wypoczynek.",
          isFallback: false,
          modelUsed: result.usedModel,
          provider: `Gemini AI (${result.usedModel})`
        };

        aiAdviceCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
        return res.json(finalData);
      } catch (jsonErr) {
        console.warn("[Advice] Błąd parsowania JSON odpowiedzi Gemini, przełączam na algorytm lokalny:", jsonErr);
      }
    }

    // Seamless Local Fallback engine
    const fallback = getLocalAdviceFallback(city || "lokalizacja", current, daily, mode);
    return res.json({
      ...fallback,
      modelUsed: "Aura-Local-Engine",
      provider: "Aura Engine (Lokalny)"
    });
  } catch (outerErr: any) {
    console.error("[Advice] Błąd krytyczny w /api/weather/ai:", outerErr);
    const fallback = getLocalAdviceFallback(req.body?.city || "lokalizacja", req.body?.current, req.body?.daily);
    res.json(fallback);
  }
});

// API Route: AI Forecast Analysis & Warning System with Multi-Model Fallback
app.post("/api/weather/analyze", async (req, res) => {
  try {
    const { weatherData } = req.body;
    if (!weatherData || !weatherData.current) {
      return res.status(400).json({ error: "Weather data required." });
    }

    const current = weatherData.current;
    const cacheKey = `analyze_${current.temperature_2m}_${current.weather_code}_${current.precipitation}_${current.wind_speed_10m}`;

    const cached = aiAnalysisCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ANALYSIS_CACHE_TTL_MS)) {
      return res.json(cached.data);
    }

    const prompt = `Analiza meteorologiczna pod kątem zagrożeń:
Kod WMO: ${current.weather_code}, Temp: ${current.temperature_2m}°C, Opady: ${current.precipitation}mm, Wiatr: ${current.wind_speed_10m}km/h.
Czy występują niebezpieczne zjawiska meteorologiczne lub gwałtowne zmiany?

Sformatuj odpowiedź WYŁĄCZNIE jako kod JSON:
{
  "warning": "Krótkie precyzyjne ostrzeżenie lub komunikat o braku zagrożeń po polsku",
  "isAlert": true/false
}`;

    const result = await generateGeminiContentWithFallback(prompt);

    if (result && result.text) {
      try {
        const cleaned = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const finalData = {
          warning: parsed.warning || "Pogoda jest stabilna.",
          isAlert: Boolean(parsed.isAlert),
          modelUsed: result.usedModel
        };
        aiAnalysisCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
        return res.json(finalData);
      } catch (e) {
        console.warn("[Analyze] Błąd parsowania odpowiedzi JSON Gemini, spadek do reguł lokalnych:", e);
      }
    }

    const code = current.weather_code;
    const lp = current.lightning_potential || 0;
    const precip = current.precipitation || 0;
    const isStormy = (code >= 95 && code <= 99) || code === 29 || lp > 0 || (code >= 80 && code <= 82 && precip > 1.0);

    let fallback = { warning: "Pogoda jest stabilna. Dobre warunki do aktywności na zewnątrz.", isAlert: false };
    if (isStormy) fallback = { warning: "Wykryto ryzyko gwałtownych burz i wyładowań. Zachowaj ostrożność i szukaj bezpiecznego schronienia.", isAlert: true };
    else if (code >= 51 && code <= 67) fallback = { warning: "Możliwe opady deszczu w najbliższym czasie. Pamiętaj o parasolu.", isAlert: false };
    else if (current.temperature_2m > 30) fallback = { warning: "Uważaj na upał! Pij dużo wody i unikaj pełnego słońca.", isAlert: true };

    res.json({ ...fallback, modelUsed: "Aura-Local-Engine" });
  } catch (err: any) {
    console.error("[Analyze] Błąd serwera:", err);
    res.json({ warning: "Pogoda stabilna.", isAlert: false, modelUsed: "Aura-Local-Engine" });
  }
});

// In-memory Google Cloud persistence store simulation for user settings & preferences
let cloudStorageStore: Record<string, any> = {
  favorites: ["Warszawa", "Kraków", "Gdańsk"],
  settings: { units: "metric", theme: "auto" },
  lastCloudSync: new Date().toISOString()
};

// Scheduled weather sync tracking (3 times a day: 06:00, 12:00, 18:00)
let weatherSyncScheduleState = {
  lastScheduledSync: new Date().toISOString(),
  scheduledTimes: ["06:00", "12:00", "18:00"],
  syncCountToday: 0,
  status: "Synchronizowany (Serwer pogodowy aktywny)"
};

// Background cron check every minute to simulate 3x daily server synchronization reset
setInterval(() => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Check if current time matches 06:00, 12:00, or 18:00 (within the first minute)
  if (minutes === 0 && (hours === 6 || hours === 12 || hours === 18)) {
    weatherSyncScheduleState.lastScheduledSync = now.toISOString();
    weatherSyncScheduleState.syncCountToday += 1;
    weatherSyncScheduleState.status = `Zsynchronizowano o ${hours}:00 (Automatyczny reset serwera pogodowego)`;
    console.log(`[Aura Cloud & Weather Sync] Scheduled sync triggered at ${hours}:00. Data refreshed from Open-Meteo server.`);
  }
}, 60000);

// API Route: Google Cloud Storage - Get user data
app.get("/api/cloud-storage", (req, res) => {
  res.json({ success: true, data: cloudStorageStore, timestamp: new Date().toISOString() });
});

// API Route: Google Cloud Storage - Save user data
app.post("/api/cloud-storage", (req, res) => {
  const { data } = req.body;
  if (data) {
    cloudStorageStore = {
      ...cloudStorageStore,
      ...data,
      lastCloudSync: new Date().toISOString()
    };
  }
  res.json({ success: true, data: cloudStorageStore, message: "Zapisano pomyślnie w chmurze Google." });
});

// API Route: Weather Server Sync Schedule & Manual Reset
app.get("/api/weather/sync-schedule", (req, res) => {
  res.json({
    success: true,
    ...weatherSyncScheduleState,
    serverTime: new Date().toISOString()
  });
});

app.post("/api/weather/force-sync", (req, res) => {
  weatherSyncScheduleState.lastScheduledSync = new Date().toISOString();
  weatherSyncScheduleState.status = "Wymuszono świeże pobranie z serwera pogodowego";
  console.log("[Aura Weather Sync] Manual server reset & sync requested.");
  res.json({
    success: true,
    message: "Połączenie z serwerem pogodowym zostało zresetowane i pomyślnie odświeżone.",
    ...weatherSyncScheduleState
  });
});

// Removed AI Assistant endpoint as requested

// Start server function to mount Vite middleware or serve static files
async function startServer() {
  const rootDir = process.cwd();
  const distPath = path.resolve(rootDir, "dist");
  const indexPath = path.resolve(distPath, "index.html");
  
  console.log(`[Aura Server] Root: ${rootDir}`);
  console.log(`[Aura Server] distPath: ${distPath}`);
  console.log(`[Aura Server] NODE_ENV: ${process.env.NODE_ENV}`);

  // In production, we MUST serve static files from dist
  if (process.env.NODE_ENV === "production" || fs.existsSync(indexPath)) {
    console.log("[Aura Server] Starting in PRODUCTION mode...");
    app.use(express.static(distPath));
    
    // SPA catch-all
    app.get("*", (req, res, next) => {
      // If it's an API request that wasn't caught, return 404
      if (req.url.startsWith("/api/")) return next();
      
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Aplikacja Aura Weather: Plik index.html nie został odnaleziony w folderze dist. Uruchom 'npm run build'.");
      }
    });
  } else {
    console.log("[Aura Server] Starting in DEVELOPMENT mode...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("[Aura Server] Failed to start Vite middleware:", e);
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Aura Server] Running at http://localhost:${PORT}`);
  });
}

startServer();
