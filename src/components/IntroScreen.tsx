import { useState, useEffect } from "react";
import { MapPin, Search, CloudSun, Loader2, AlertCircle } from "lucide-react";
import { detectUserLocation } from "../utils/geolocation";
import { Capacitor } from "@capacitor/core";

interface IntroScreenProps {
  onLocationSelected: (lat: number, lng: number, cityName?: string, silent?: boolean, isManual?: boolean) => void;
  isLoading: boolean;
  initialMessage?: string | null;
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  rawName: string;
  subLabel?: string;
}

export default function IntroScreen({ onLocationSelected, isLoading, initialMessage }: IntroScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(initialMessage || null);

  // Sync initialMessage if it changes
  useEffect(() => {
    if (initialMessage) {
      setError(initialMessage);
    }
  }, [initialMessage]);

  // Live search debouncing for high precision Polish location lookup
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      console.log(`🔍 [City Search] Query: "${query}" (Native Platform: ${Capacitor.isNativePlatform()})`);
      setError(null);
      setIsSearching(true);
      
      try {
        let mappedResults: SearchResult[] = [];

        // 1. Try Nominatim (OpenStreetMap) directly
        try {
          console.log("🔍 [City Search] Attempting Nominatim API search...");
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=10&countrycodes=pl`, {
            headers: {
              'Accept-Language': 'pl'
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              mappedResults = data.map((item: any) => {
                const lat = Number(item.lat);
                const lng = Number(item.lon);
                
                const address = item.address || {};
                const mainLocality = address.village || address.town || address.city || address.hamlet || address.locality || address.suburb || item.display_name.split(',')[0];

                const adminDetails: string[] = [];
                if (address.municipality) {
                  const m = address.municipality.replace(/^gmina\s+/i, '');
                  adminDetails.push(`gm. ${m}`);
                }
                if (address.county) {
                  const c = address.county.replace(/^powiat\s+/i, '');
                  adminDetails.push(`pow. ${c}`);
                }
                if (address.state) {
                  const s = address.state.replace(/^województwo\s+/i, '');
                  adminDetails.push(`woj. ${s}`);
                }

                const subLabel = adminDetails.join(' • ');
                const displayName = subLabel ? `${mainLocality} (${subLabel})` : item.display_name;
                
                return {
                  name: displayName,
                  lat,
                  lng,
                  rawName: mainLocality,
                  subLabel
                };
              });
              console.log("🔍 [City Search Diagnostic]", { provider: "Nominatim", count: mappedResults.length, query });
            }
          }
        } catch (backendErr) {
          console.warn("🔍 [City Search] Nominatim API error, falling back to Open-Meteo geocoding:", backendErr);
        }

        // 2. Direct Open-Meteo Geocoding API (For Native APK or Web fallback)
        if (mappedResults.length === 0) {
          const omGeoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=pl&format=json`;
          console.log("🔍 [City Search] Direct Open-Meteo Geocoding URL:", omGeoUrl);
          
          const omGeoRes = await fetch(omGeoUrl);
          if (omGeoRes.ok) {
            const omGeoData = await omGeoRes.json();
            if (omGeoData.results && Array.isArray(omGeoData.results)) {
              mappedResults = omGeoData.results.map((item: any) => {
                const adminParts: string[] = [];
                if (item.admin3) adminParts.push(item.admin3.replace(/^Gmina\s+/i, 'gm. '));
                if (item.admin2) adminParts.push(item.admin2.replace(/^Powiat\s+/i, 'pow. '));
                if (item.admin1) adminParts.push(item.admin1.startsWith('woj.') ? item.admin1 : `woj. ${item.admin1}`);

                const subLabel = adminParts.join(' • ');
                const displayName = subLabel ? `${item.name} (${subLabel})` : item.name;
                
                return {
                  name: displayName,
                  lat: Number(item.latitude),
                  lng: Number(item.longitude),
                  rawName: item.name,
                  subLabel
                };
              });
              console.log("🔍 [City Search Diagnostic]", { provider: "Open-Meteo", count: mappedResults.length, query });
            }
          }
        }

        if (mappedResults.length > 0) {
          const valid = mappedResults.filter(r => !isNaN(r.lat) && !isNaN(r.lng));
          setSearchResults(valid);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        console.error("🔍 [City Search] Search failed with exception:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleGetGPSLocation = async () => {
    setError(null);
    setIsSearching(true);

    try {
      console.log("📍 [IntroScreen] User clicked GPS location button");
      const loc = await detectUserLocation({ timeoutMs: 8000 });
      console.log("📍 [IntroScreen] Detected location:", loc);
      setIsSearching(false);
      onLocationSelected(loc.lat, loc.lng, loc.cityName, false, false);
    } catch (err: any) {
      console.warn("📍 [IntroScreen] Location detection error:", err);
      setIsSearching(false);
      setError(err?.message || "Lokalizacja GPS jest niedostępna lub została zablokowana. Wybierz miejscowość z listy lub wpisz w wyszukiwarce.");
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    console.log("🔍 [City Search] User selected result:", result);
    if (isNaN(result.lat) || isNaN(result.lng)) {
      console.error("🔍 [City Search] Selected result has invalid coordinates!", result);
      setError("Wybrana miejscowość posiada nieprawidłowe współrzędne.");
      return;
    }
    setSearchResults([]);
    setSearchQuery("");
    onLocationSelected(result.lat, result.lng, result.rawName || result.name, false, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      handleSelectResult(searchResults[0]);
    }
  };

  const popularPlaces = [
    { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
    { name: "Kraków", lat: 50.0647, lng: 19.9450 },
    { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
    { name: "Wrocław", lat: 51.1100, lng: 17.0325 },
    { name: "Poznań", lat: 52.4064, lng: 16.9252 },
    { name: "Katowice", lat: 50.2649, lng: 19.0238 },
    { name: "Łódź", lat: 51.7592, lng: 19.4560 },
    { name: "Szczecin", lat: 53.4285, lng: 14.5528 },
    { name: "Lublin", lat: 51.2465, lng: 22.5684 },
    { name: "Toruń", lat: 53.0138, lng: 18.5984 },
    { name: "Zakopane", lat: 49.2992, lng: 19.9496 },
  ];

  const showLoading = isLoading || isSearching;

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-slate-950 min-h-full relative overflow-hidden">
      
      {/* Decorative Background Glows */}
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Upper Logo / Icon Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-5 my-auto z-10">
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full bg-blue-500/10 opacity-50 blur-2xl animate-pulse"></div>
          <div className="relative bg-slate-900/80 p-5 rounded-3xl border border-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <CloudSun className="w-16 h-16 text-blue-400 animate-bounce" style={{ animationDuration: "3s" }} />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-light tracking-tight text-slate-100">
            Aura <span className="font-semibold text-blue-400">Pogoda</span>
          </h1>
          <p className="text-slate-400 text-xs mt-2 max-w-[280px] mx-auto uppercase tracking-widest font-semibold opacity-70">
            Inteligentna prognoza pogody &bull; IMGW &bull; Aura AI
          </p>
        </div>
      </div>

      {/* Input / Action Area */}
      <div className="space-y-4 z-10">
        
        {/* Informative Alert / Error if GPS was unavailable */}
        {error && (
          <div className="flex items-start space-x-2.5 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="flex-1">
              <span className="font-semibold block text-amber-200 mb-0.5">Wybór lokalizacji:</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* GPS Button */}
        <button
          onClick={handleGetGPSLocation}
          disabled={showLoading}
          className="w-full flex items-center justify-center space-x-2 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl shadow-lg shadow-blue-950/20 active:scale-98 transition-all duration-150 disabled:opacity-50 text-sm"
          id="btn-gps-location"
        >
          {showLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MapPin className="w-5 h-5 text-blue-200 animate-pulse" />
          )}
          <span>{showLoading ? "Pobieranie..." : "Użyj mojej lokalizacji (GPS)"}</span>
        </button>

        {/* Divider */}
        <div className="flex items-center space-x-3 text-slate-600 text-[10px] uppercase tracking-widest py-0.5">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span>LUB WYBIERZ MIEJSCOWOŚĆ</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Search Bar with Live Suggestions Dropdown */}
        <div className="relative">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Wpisz miejscowość, np. Warszawa, Lipno, Hel"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="w-full py-3.5 pl-4 pr-12 bg-slate-900/90 border border-slate-800 focus:border-blue-500 rounded-2xl focus:outline-none text-white placeholder-slate-500 transition-all text-sm shadow-inner"
              id="input-city-search"
            />
            <div className="absolute right-3.5 text-slate-400">
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto divide-y divide-slate-800/60">
              {searchResults.map((res, idx) => (
                <button
                  key={`${res.lat}-${res.lng}-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(res)}
                  className="w-full text-left px-4 py-3 text-xs text-slate-200 hover:bg-blue-600/30 hover:text-white flex items-start space-x-2.5 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-slate-100 text-xs sm:text-sm">{res.rawName}</span>
                    {res.subLabel && (
                      <span className="text-[11px] text-slate-400 font-medium leading-snug">{res.subLabel}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Popular Suggestion Pills */}
        <div className="space-y-2 pt-1">
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold pl-1">Szybki wybór miast w Polsce:</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {popularPlaces.map((place) => (
              <button
                key={place.name}
                type="button"
                onClick={() => onLocationSelected(place.lat, place.lng, place.name, false, true)}
                disabled={showLoading}
                className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800/80 rounded-full text-xs text-slate-300 hover:text-white active:scale-95 transition-all"
                id={`btn-quick-place-${place.name.replace(/\s+/g, '-')}`}
              >
                {place.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

