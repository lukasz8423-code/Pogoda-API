import { useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, RefreshCw, Search, MapPin, Compass } from "lucide-react";

interface WeatherErrorProps {
  message: string;
  onRetry: () => void;
  onBackToSearch?: () => void;
  onLocationSelected?: (lat: number, lng: number, cityName?: string, silent?: boolean, isManual?: boolean) => void;
}

export default function WeatherError({
  message,
  onRetry,
  onBackToSearch,
  onLocationSelected,
}: WeatherErrorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);

  const popularPlaces = [
    { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
    { name: "Kraków", lat: 50.0647, lng: 19.9450 },
    { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
    { name: "Wrocław", lat: 51.1100, lng: 17.0325 },
    { name: "Poznań", lat: 52.4064, lng: 16.9252 },
    { name: "Katowice", lat: 50.2649, lng: 19.0238 },
  ];

  const getErrorTitle = (msg?: string) => {
    if (!msg || typeof msg !== "string") return "Problem z pobraniem danych";
    const m = msg.toLowerCase();
    if (m.includes("offline") || m.includes("brak połączenia") || m.includes("sieć") || m.includes("internet")) {
      return "Brak połączenia z siecią";
    }
    if (m.includes("gps") || m.includes("lokalizacj") || m.includes("odrzucon") || m.includes("zablokowan")) {
      return "Problem z geolokalizacją GPS";
    }
    if (m.includes("timeout") || m.includes("czas")) {
      return "Przekroczono czas oczekiwania";
    }
    if (m.includes("nie znaleziono") || m.includes("współrzędne")) {
      return "Nie znaleziono miejscowości";
    }
    if (m.includes("http") || m.includes("serwer") || m.includes("50") || m.includes("40")) {
      return "Błąd serwera pogody";
    }
    return "Problem z pobraniem danych";
  };

  const handleSearch = async (query: string) => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const normQuery = q.toLowerCase();
      const candidateList: Array<{
        name: string;
        lat: number;
        lng: number;
        rawName: string;
        subLabel?: string;
        isPoland: boolean;
        population: number;
        isExactMatch: boolean;
      }> = [];

      // 1. Open-Meteo Geocoding
      const omPromise = (async () => {
        try {
          const omRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=pl&format=json`
          );
          if (omRes.ok) {
            const omData = await omRes.json();
            return omData.results || [];
          }
        } catch (e) {}
        return [];
      })();

      // 2. Nominatim
      const nomPromise = (async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=10&countrycodes=pl`,
            { headers: { "Accept-Language": "pl" } }
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
          }
        } catch (e) {}
        return [];
      })();

      const [omResults, nomResults] = await Promise.all([omPromise, nomPromise]);

      for (const item of omResults) {
        const lat = Number(item.latitude);
        const lng = Number(item.longitude);
        if (isNaN(lat) || isNaN(lng)) continue;

        const adminParts: string[] = [];
        if (item.admin3 && item.admin3.toLowerCase() !== item.name.toLowerCase()) {
          adminParts.push(item.admin3.replace(/^Gmina\s+/i, 'gm. '));
        }
        if (item.admin2) adminParts.push(item.admin2.replace(/^Powiat\s+/i, 'pow. '));
        if (item.admin1) {
          const a1 = item.admin1.replace(/^Województwo\s+/i, 'woj. ');
          adminParts.push(a1.startsWith('woj.') ? a1 : `woj. ${a1}`);
        }

        const subLabel = adminParts.join(' • ');
        const displayName = subLabel ? `${item.name} (${subLabel})` : item.name;
        const countryCode = (item.country_code || '').toLowerCase();
        const inPoland = countryCode === 'pl' || (lat >= 48.0 && lat <= 56.0 && lng >= 13.0 && lng <= 25.5);
        const exact = item.name.toLowerCase() === normQuery;

        candidateList.push({
          name: displayName,
          lat,
          lng,
          rawName: item.name,
          subLabel,
          isPoland: inPoland,
          population: Number(item.population) || 0,
          isExactMatch: exact
        });
      }

      for (const item of nomResults) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (isNaN(lat) || isNaN(lng)) continue;

        const address = item.address || {};
        const mainLocality = address.village || address.town || address.city || address.hamlet || address.locality || item.display_name.split(',')[0].trim();
        const adminDetails: string[] = [];
        if (address.municipality && address.municipality.toLowerCase() !== mainLocality.toLowerCase()) {
          adminDetails.push(`gm. ${address.municipality.replace(/^gmina\s+/i, '')}`);
        }
        if (address.county) adminDetails.push(`pow. ${address.county.replace(/^powiat\s+/i, '')}`);
        if (address.state) adminDetails.push(`woj. ${address.state.replace(/^województwo\s+/i, '')}`);

        const subLabel = adminDetails.join(' • ');
        const displayName = subLabel ? `${mainLocality} (${subLabel})` : item.display_name;
        const inPoland = (address.country_code || '').toLowerCase() === 'pl' || (lat >= 48.0 && lat <= 56.0 && lng >= 13.0 && lng <= 25.5);
        const exact = mainLocality.toLowerCase() === normQuery;

        candidateList.push({
          name: displayName,
          lat,
          lng,
          rawName: mainLocality,
          subLabel,
          isPoland: inPoland,
          population: 0,
          isExactMatch: exact
        });
      }

      const deduplicated: typeof candidateList = [];
      for (const cand of candidateList) {
        const alreadyExists = deduplicated.some(d => {
          const dist = Math.hypot(d.lat - cand.lat, d.lng - cand.lng);
          return dist < 0.04 && d.rawName.toLowerCase() === cand.rawName.toLowerCase();
        });
        if (!alreadyExists) {
          deduplicated.push(cand);
        }
      }

      deduplicated.sort((a, b) => {
        const aExact = a.isExactMatch ? 1 : 0;
        const bExact = b.isExactMatch ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        const aStarts = a.rawName.toLowerCase().startsWith(normQuery) ? 1 : 0;
        const bStarts = b.rawName.toLowerCase().startsWith(normQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;

        const aPL = a.isPoland ? 1 : 0;
        const bPL = b.isPoland ? 1 : 0;
        if (aPL !== bPL) return bPL - aPL;

        return b.population - a.population;
      });

      setSearchResults(deduplicated.map(d => ({ name: d.name, lat: d.lat, lng: d.lng })));
    } catch (err) {
      console.warn("Error search failed:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const safeMsg = (message || "").toLowerCase();
  const isLocationIssue = safeMsg.includes("lokalizacj") || 
                          safeMsg.includes("gps") || 
                          safeMsg.includes("zablokowan") ||
                          safeMsg.includes("niedostępn");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-between min-h-full p-6 text-center bg-slate-950 text-slate-200 overflow-y-auto"
    >
      <div className="w-full flex-1 flex flex-col items-center justify-center my-auto max-w-sm">
        <div className="p-4 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4 shadow-lg shadow-rose-950/20">
          <AlertCircle className="w-12 h-12" />
        </div>

        <h2 className="text-xl font-bold mb-2 text-white">{getErrorTitle(message)}</h2>
        <p className="text-slate-400 text-xs sm:text-sm mb-6 max-w-xs leading-relaxed">
          {message}
        </p>

        {/* Quick Search on Error Screen */}
        {onLocationSelected && (
          <div className="w-full mb-6 text-left">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-1.5 pl-1">
              Wyszukaj miejscowość ręcznie:
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                placeholder="Wpisz np. Warszawa, Lipno, Gdańsk..."
                className="w-full py-3 pl-4 pr-10 bg-slate-900 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 transition-colors"
                id="input-error-city-search"
              />
              <div className="absolute right-3 top-3 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-800/60 max-h-40 overflow-y-auto">
                {searchResults.map((r, idx) => (
                  <button
                    key={`${r.lat}-${r.lng}-${idx}`}
                    type="button"
                    onClick={() => onLocationSelected(r.lat, r.lng, r.name, false, true)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-blue-600/30 hover:text-white flex items-center space-x-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="font-medium truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Popular Polish Cities */}
        {onLocationSelected && (
          <div className="w-full mb-6 text-left">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-2 pl-1">
              Szybki wybór:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {popularPlaces.map((place) => (
                <button
                  key={place.name}
                  type="button"
                  onClick={() => onLocationSelected(place.lat, place.lng, place.name, false, true)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 hover:text-white transition-colors"
                  id={`btn-error-place-${place.name.toLowerCase()}`}
                >
                  {place.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          {onBackToSearch && (
            <button
              onClick={onBackToSearch}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              id="btn-error-back-to-search"
            >
              <Search className="w-4 h-4" />
              <span>Przejdź do wyszukiwarki miast</span>
            </button>
          )}

          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            id="btn-error-retry"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{isLocationIssue ? "Spróbuj ponownie pobrać GPS" : "Spróbuj ponownie"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

