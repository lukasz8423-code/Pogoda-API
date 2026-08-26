import { getDistanceKm } from "./distance";
import { smartFetch } from "./fetch";
import { cachedFetch, CACHE_TTLS } from "./cache";

export async function fetchNearestGiosAirQuality(userLat: number, userLng: number) {
  const cacheKey = `aqi_${userLat.toFixed(2)}_${userLng.toFixed(2)}`;
  return cachedFetch(cacheKey, async () => {
    try {
      // First try backend Express proxy route on Web
      try {
        const apiRes = await fetch(`/api/gios/air-quality?lat=${userLat}&lng=${userLng}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData && (apiData.aqi || apiData.stationName)) {
            return apiData;
          }
        }
      } catch (proxyErr) {
        console.warn("Backend GIOŚ proxy call skipped/failed, trying direct fetch:", proxyErr);
      }

      // 1. Find all stations
      const stationsRes = await smartFetch("https://api.gios.gov.pl/pjp-api/rest/station/findAll");
      if (!stationsRes.ok) return null;
      const stations = await stationsRes.json();

      let nearest = null;
      let minDistance = Infinity;

      for (const s of stations) {
        const lat = parseFloat(s.gegrLat);
        const lng = parseFloat(s.gegrLon);
        if (isNaN(lat) || isNaN(lng)) continue;

        const dist = getDistanceKm(userLat, userLng, lat, lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = { ...s, distanceKm: dist };
        }
      }

      if (!nearest) return null;

      // 2. Get AQI for the nearest station
      const aqiRes = await smartFetch(`https://api.gios.gov.pl/pjp-api/rest/aqindex/getIndex/${nearest.id}`);
      if (!aqiRes.ok) return null;
      const aqiData = await aqiRes.json();

      // Mapping GIOŚ levels to a readable string
      const aqiLabel = aqiData.stIndexLevel?.indexLevelName || "Brak danych";

      return {
        stationName: nearest.stationName,
        address: nearest.addressStreet,
        distanceKm: nearest.distanceKm,
        aqi: aqiLabel,
        pm10: aqiData.pm10IndexLevel?.indexLevelName,
        pm25: aqiData.pm25IndexLevel?.indexLevelName,
        o3: aqiData.o3IndexLevel?.indexLevelName,
        no2: aqiData.no2IndexLevel?.indexLevelName,
        source: "GIOŚ (Główny Inspektorat Ochrony Środowiska)"
      };
    } catch (err) {
      console.warn("GIOŚ fetch warning (likely CORS on Web):", err);
      return null;
    }
  }, CACHE_TTLS.AQI);
}
