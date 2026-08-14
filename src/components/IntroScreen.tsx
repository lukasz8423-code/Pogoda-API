import { useState, useEffect } from "react";
import { MapPin, Search, CloudSun, Loader2, AlertCircle } from "lucide-react";
import { detectUserLocation } from "../utils/geolocation";

interface IntroScreenProps {
  onLocationSelected: (lat: number, lng: number, cityName?: string) => void;
  isLoading: boolean;
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  rawName: string;
}

export default function IntroScreen({ onLocationSelected, isLoading }: IntroScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live search debouncing for high precision Polish location lookup
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        let res = await fetch(`/api/search-city?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        } else {
          throw new Error("API search failed");
        }
      } catch (err) {
        console.warn("Backend search unreachable, falling back to Open-Meteo geocoding...", err);
        try {
          const omGeoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery.trim())}&count=10&language=pl&format=json`);
          if (omGeoRes.ok) {
            const omGeoData = await omGeoRes.json();
            if (omGeoData.results) {
              const mapped = omGeoData.results.map((item: any) => ({
                name: item.name,
                country: item.country || "Polska",
                admin1: item.admin1 || item.country || "",
                lat: item.latitude,
                lon: item.longitude,
                display_name: `${item.name}, ${item.admin1 || item.country || ""}`
              }));
              setSearchResults(mapped);
            }
          }
        } catch (omErr) {
          console.warn("Open-Meteo geocoding fallback failed:", omErr);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleGetGPSLocation = async () => {
    setError(null);
    setIsSearching(true);

    try {
      const loc = await detectUserLocation({ timeoutMs: 7000 });
      setIsSearching(false);
      onLocationSelected(loc.lat, loc.lng, loc.cityName);
    } catch (err: any) {
      console.warn("Location detection error:", err);
      setIsSearching(false);
      setError("Nie udało się pobrać automatycznej lokalizacji. Wybierz miejscowość z listy.");
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setSearchResults([]);
    setSearchQuery("");
    onLocationSelected(result.lat, result.lng, result.name);
  };

  const popularPlaces = [
    { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
    { name: "Kraków", lat: 50.0647, lng: 19.9450 },
    { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
    { name: "Poznań", lat: 52.4064, lng: 16.9252 },
    { name: "Wrocław", lat: 51.1100, lng: 17.0325 },
  ];

  const showLoading = isLoading || isSearching;

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-slate-950 min-h-full relative overflow-hidden">
      
      {/* Decorative Background Glows */}
      <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Upper Logo / Icon Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 my-auto z-10">
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full bg-blue-500/10 opacity-50 blur-2xl animate-pulse"></div>
          <div className="relative bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <CloudSun className="w-20 h-20 text-blue-400 animate-bounce" style={{ animationDuration: "3s" }} />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-light tracking-tight text-slate-100">
            Aura <span className="font-semibold text-blue-400">Pogoda</span>
          </h1>
          <p className="text-slate-400 text-xs mt-2 max-w-[280px] mx-auto uppercase tracking-widest font-semibold opacity-70">
            Inteligentna prognoza pogody &bull; Aura AI
          </p>
        </div>
      </div>

      {/* Input / Action Area */}
      <div className="space-y-5 z-10">
        
        {/* Error Alert */}
        {error && (
          <div className="flex items-start space-x-2 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* GPS Button */}
        <button
          onClick={handleGetGPSLocation}
          disabled={showLoading}
          className="w-full flex items-center justify-center space-x-2 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl shadow-lg shadow-blue-950/20 active:scale-98 transition-all duration-150 disabled:opacity-50"
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
        <div className="flex items-center space-x-3 text-slate-600 text-[10px] uppercase tracking-widest py-1">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span>LUB WPISZ MIEJSCOWOŚĆ</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Search Bar with Live Suggestions Dropdown */}
        <div className="relative">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Wpisz miejscowość, np. Warszawa, Kraków, Lipno"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={showLoading}
              className="w-full py-3.5 pl-4 pr-12 bg-slate-900/80 border border-slate-800 rounded-2xl focus:outline-none focus:border-blue-500 text-white placeholder-slate-500 transition-all text-sm"
              id="input-city-search"
            />
            <div className="absolute right-3.5 text-slate-400">
              <Search className="w-4 h-4" />
            </div>
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto divide-y divide-slate-800/50">
              {searchResults.map((res, idx) => (
                <button
                  key={`${res.lat}-${res.lng}-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(res)}
                  className="w-full text-left px-4 py-3 text-xs text-slate-200 hover:bg-blue-600/20 hover:text-white flex items-center space-x-2 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-medium">{res.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Popular Suggestion Pills */}
        <div className="space-y-2">
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold pl-1">Szybki wybór miejscowości:</p>
          <div className="flex flex-wrap gap-1.5">
            {popularPlaces.map((place) => (
              <button
                key={place.name}
                type="button"
                onClick={() => onLocationSelected(place.lat, place.lng, place.name)}
                disabled={showLoading}
                className="px-3.5 py-1.5 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-full text-xs text-slate-300 hover:text-white active:scale-95 transition-all"
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
