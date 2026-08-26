import { getDistanceKm } from "./distance";
import { smartFetch } from "./fetch";
import { cachedFetch, CACHE_TTLS } from "./cache";

export interface UnifiedImgwStation {
  id: string;
  id_stacji?: string;
  name: string;
  stationName: string;
  lat: number;
  lng: number;
  temp: number | null;
  tempFormatted?: string;
  humidity: number | null;
  windSpeed: number | null;
  windDirection?: number | null;
  windGust?: number | null;
  pressure: number | null;
  rawPressure?: string | null;
  synopPressureStation?: {
    stationName: string;
    distanceKm: number;
    pressure: number;
  } | null;
  solarRadiation?: number | null;
  solarRadiationSource?: string;
  soilMoisture?: number | null;
  soilMoistureSource?: string;
  groundTemp?: number | null;
  soilTemp?: number | null;
  rainRate?: number | null;
  distance: string;
  distanceKm: number;
  lastSync?: string;
  measurementTime?: string;
  status: string;
  isOfficial: boolean;
  candidates?: any[];
  nearestCandidates?: any[];
  raw?: any;
}

function normalizeStationName(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e")
    .replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o")
    .replace(/ś/g, "s").replace(/ź/g, "z").replace(/ż/g, "z")
    .trim();
}

function parseNum(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Unified IMGW station fetcher:
 * 1. Fetches all active IMGW stations from https://danepubliczne.imgw.pl/api/data/meteo (785 stations with real lat/lon in payload)
 * 2. Fetches synop in parallel to enrich barometric pressure (cisnienie)
 * 3. Uses exact lat/lon directly from IMGW API for each station
 * 4. Calculates Haversine distance from user GPS
 * 5. Sorts ascending and selects nearest
 * 6. Logs TOP 10 candidate stations to console.table
 */
export async function fetchNearestImgwStation(userLat: number, userLng: number): Promise<UnifiedImgwStation | null> {
  const cacheKey = `imgw_${userLat.toFixed(2)}_${userLng.toFixed(2)}`;
  return cachedFetch(cacheKey, async () => {
    try {
      console.log(`📡 [IMGW Unified] Pobieranie aktualnej sieci stacji IMGW dla GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)})...`);
      
      // First try backend Express proxy route on Web to avoid browser CORS restrictions
      try {
        const apiRes = await fetch(`/api/imgw/nearest?lat=${userLat}&lng=${userLng}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData && (apiData.stationName || apiData.id)) {
            console.log(`✅ [IMGW Proxy] Pobrano dane stacji przez backend API: ${apiData.stationName}`);
            return apiData;
          }
        }
      } catch (apiErr) {
        console.warn("Backend IMGW proxy call skipped/failed, trying direct fetch:", apiErr);
      }

    // Fetch live meteo network and synop in parallel
    const [meteoRes, synopRes] = await Promise.allSettled([
      smartFetch("https://danepubliczne.imgw.pl/api/data/meteo"),
      smartFetch("https://danepubliczne.imgw.pl/api/data/synop")
    ]);

    // Build synop pressure dictionary (normalized name -> synop item)
    const synopMap = new Map<string, any>();
    if (synopRes.status === "fulfilled" && synopRes.value && synopRes.value.ok) {
      try {
        const synopList = await synopRes.value.json();
        if (Array.isArray(synopList)) {
          for (const s of synopList) {
            if (s.stacja) {
              synopMap.set(normalizeStationName(s.stacja), s);
            }
          }
        }
      } catch (err) {
        console.warn("Could not parse synop JSON:", err);
      }
    }

    let rawStations: any[] = [];
    let isMeteoSource = false;

    if (meteoRes.status === "fulfilled" && meteoRes.value && meteoRes.value.ok) {
      try {
        const meteoList = await meteoRes.value.json();
        if (Array.isArray(meteoList) && meteoList.length > 0) {
          rawStations = meteoList;
          isMeteoSource = true;
        }
      } catch (err) {
        console.warn("Could not parse meteo JSON:", err);
      }
    }

    // Fallback if meteo API is unreachable
    if (!isMeteoSource || rawStations.length === 0) {
      console.warn("⚠️ [IMGW Unified] Brak dostępu do API meteo, próba użycia synop...");
      if (synopMap.size > 0) {
        rawStations = Array.from(synopMap.values());
      }
    }

    if (rawStations.length === 0) {
      console.error("❌ [IMGW Unified] Brak danych ze stacji IMGW.");
      return null;
    }

    const candidates: any[] = [];

    for (const item of rawStations) {
      if (!item) continue;

      let stLat: number | null = null;
      let stLng: number | null = null;
      let stationName: string = "";
      let stationId: string = "";
      let rawTemp: number | null = null;
      let rawHum: number | null = null;
      let rawWind: number | null = null;
      let rawRain: number | null = null;
      let rawGround: number | null = null;
      let rawPress: number | null = null;
      let measurementTime: string = "";

      if (isMeteoSource) {
        // Read lat and lon directly from IMGW API response
        stLat = parseNum(item.lat);
        stLng = parseNum(item.lon);
        if (stLat === null || stLng === null) continue;

        stationName = item.nazwa_stacji || "Stacja IMGW";
        stationId = item.kod_stacji || "";

        rawTemp = parseNum(item.temperatura_powietrza);
        if (rawTemp === null) continue; // Station must have valid active temperature reading

        rawHum = parseNum(item.wilgotnosc_wzgledna);
        const windMs = parseNum(item.wiatr_srednia_predkosc);
        rawWind = windMs !== null ? Math.round(windMs * 3.6) : null;
        rawRain = parseNum(item.opad_10min);
        rawGround = parseNum(item.temperatura_gruntu);

        // Synop pressure enrichment
        const synopMatch = synopMap.get(normalizeStationName(stationName));
        if (synopMatch && synopMatch.cisnienie) {
          rawPress = parseNum(synopMatch.cisnienie);
        }

        measurementTime = item.temperatura_powietrza_data || item.opad_10min_data || "";
      } else {
        // Synop source fallback
        stationName = item.stacja || "Stacja IMGW";
        stationId = item.id_stacji || "";
        stLat = parseNum(item.lat);
        stLng = parseNum(item.lon);
        if (stLat === null || stLng === null) continue;

        rawTemp = parseNum(item.temperatura);
        if (rawTemp === null) continue;

        rawHum = parseNum(item.wilgotnosc_wzgledna);
        const windMs = parseNum(item.predkosc_wiatru);
        rawWind = windMs !== null ? Math.round(windMs * 3.6) : null;
        rawRain = parseNum(item.suma_opadu);
        rawPress = parseNum(item.cisnienie);
        measurementTime = `${item.data_pomiaru || ''} ${item.godzina_pomiaru || ''}:00`;
      }

      // Calculate exact Haversine distance
      const dist = getDistanceKm(userLat, userLng, stLat, stLng);
      const distanceKm = Number(dist.toFixed(1));

      candidates.push({
        id: stationId,
        id_stacji: stationId,
        name: stationName,
        stationName,
        lat: stLat,
        lng: stLng,
        distanceKm,
        distance: `${distanceKm} km`,
        temp: rawTemp,
        humidity: rawHum,
        windSpeed: rawWind,
        pressure: rawPress ? Number(rawPress.toFixed(1)) : null,
        rainRate: rawRain,
        groundTemp: rawGround,
        soilTemp: rawGround,
        measurementTime,
        lastSync: measurementTime,
        status: isMeteoSource ? "Online - Telemetria IMGW-PIB" : "Online - Synop IMGW-PIB",
        isOfficial: true,
        raw: item
      });
    }

    if (candidates.length === 0) {
      console.warn("⚠️ [IMGW Unified] Nie znaleziono stacji z poprawnymi współrzędnymi.");
      return null;
    }

    // Sort strictly by Haversine distance ascending
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);

    // TOP 10 candidates
    const top10 = candidates.slice(0, 10);

    // Find nearest station in candidates that has synop pressure reading
    const nearestWithSynopPressure = candidates.find(c => c.pressure !== null && !isNaN(c.pressure));

    // LOG TOP 10 STATIONS DIRECTLY TO CONSOLE.TABLE
    console.log(`📍 [IMGW Unified] TOP 10 najbliższych stacji IMGW dla GPS (${userLat.toFixed(4)}, ${userLng.toFixed(4)}):`);
    console.table(
      top10.map((c, i) => ({
        "Poz.": i + 1,
        "ID": c.id,
        "Nazwa Stacji IMGW": c.stationName,
        "Szerokość (Lat)": c.lat,
        "Długość (Lng)": c.lng,
        "Odległość (km)": c.distanceKm,
        "Temp (°C)": c.temp !== null ? `${c.temp}°C` : "—",
        "Wiatr (km/h)": c.windSpeed !== null ? `${c.windSpeed} km/h` : "—",
        "Ciśnienie (hPa)": c.pressure ? `${c.pressure} hPa` : "Brak barometru"
      }))
    );

    const cleanTop10 = top10.map(c => {
      const copy = { ...c };
      delete copy.candidates;
      delete copy.nearestCandidates;
      return copy;
    });

    const nearest = { ...cleanTop10[0] };
    nearest.tempFormatted = nearest.temp !== null ? `${nearest.temp.toFixed(1).replace('.', ',')}°C` : "Brak danych";
    nearest.solarRadiation = null;
    nearest.solarRadiationSource = "Brak aktynometru na stacji IMGW";
    nearest.soilMoisture = null;
    nearest.soilMoistureSource = "Brak czujnika wilgotności gleby na stacji IMGW";
    
    if (nearest.pressure === null && nearestWithSynopPressure) {
      nearest.synopPressureStation = {
        stationName: nearestWithSynopPressure.stationName,
        distanceKm: nearestWithSynopPressure.distanceKm,
        pressure: nearestWithSynopPressure.pressure!
      };
    }

    console.log(`✅ [IMGW Unified] Wybrano stację najbliższą: ${nearest.stationName} (ID: ${nearest.id}, ${nearest.distanceKm} km, ${nearest.tempFormatted})`);

    return {
      ...nearest,
      candidates: cleanTop10,
      nearestCandidates: cleanTop10
    };
  } catch (err) {
    console.error("❌ [IMGW Unified] Błąd pobierania stacji IMGW:", err);
    return null;
  }
  }, CACHE_TTLS.IMGW);
}

// Alias for backwards compatibility
export const fetchNearestImgwSynop = fetchNearestImgwStation;

export async function fetchNearestImgwHydro(userLat: number, userLng: number) {
  try {
    // 1. Try backend proxy route on Web
    try {
      const apiRes = await fetch(`/api/imgw/hydro?lat=${userLat}&lng=${userLng}`);
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (apiData && apiData.stations) {
          return apiData;
        }
      }
    } catch (proxyErr) {
      // Backend proxy unavailable or skipped
    }

    // 2. Direct fetch fallback with timeout
    const res = await smartFetch("https://danepubliczne.imgw.pl/api/data/hydro", {}, 4000);
    if (!res || !res.ok) return null;
    const stations = await res.json();
    return {
      stations: Array.isArray(stations) ? stations.slice(0, 10) : [],
      source: "IMGW-PIB (Monitor)"
    };
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
      console.warn("IMGW Hydro fetch aborted / timed out.");
    } else {
      console.warn("IMGW Hydro fetch notice:", err);
    }
    return null;
  }
}
