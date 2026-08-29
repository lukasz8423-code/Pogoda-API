import React, { useState, useEffect } from "react";
import { Bookmark, MapPin, Plus, Trash2 } from "lucide-react";

export interface SavedPlace {
  name: string;
  lat: number;
  lng: number;
}

interface SavedPlacesProps {
  currentCity: string;
  currentLat: number;
  currentLng: number;
  onSelectPlace: (lat: number, lng: number, name: string) => void;
}

export const DEFAULT_PLACES: SavedPlace[] = [
  { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
  { name: "Kraków", lat: 50.0647, lng: 19.9450 },
  { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
  { name: "Wrocław", lat: 51.1079, lng: 17.0385 }
];

/**
 * Safely compares two geographic locations by distance and name, guarding against NaN.
 */
export function areLocationsEqual(
  lat1: number | undefined | null,
  lng1: number | undefined | null,
  lat2: number | undefined | null,
  lng2: number | undefined | null,
  name1?: string,
  name2?: string
): boolean {
  const nLat1 = Number(lat1);
  const nLng1 = Number(lng1);
  const nLat2 = Number(lat2);
  const nLng2 = Number(lng2);

  const hasValidCoords1 = !isNaN(nLat1) && !isNaN(nLng1) && isFinite(nLat1) && isFinite(nLng1);
  const hasValidCoords2 = !isNaN(nLat2) && !isNaN(nLng2) && isFinite(nLat2) && isFinite(nLng2);

  if (hasValidCoords1 && hasValidCoords2) {
    const dLat = Math.abs(nLat1 - nLat2);
    const dLng = Math.abs(nLng1 - nLng2);
    if (!isNaN(dLat) && !isNaN(dLng) && dLat < 0.01 && dLng < 0.01) {
      return true;
    }
  }

  if (name1 && name2 && typeof name1 === "string" && typeof name2 === "string") {
    const clean1 = name1.split(",")[0].trim().toLowerCase();
    const clean2 = name2.split(",")[0].trim().toLowerCase();
    if (clean1.length > 0 && clean1 === clean2) {
      return true;
    }
  }

  return false;
}

/**
 * Parses saved places from localStorage without losing existing history or failing on string coordinates.
 */
export function loadSavedPlacesFromStorage(): SavedPlace[] {
  try {
    const stored = localStorage.getItem("aura_saved_places");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid: SavedPlace[] = [];
        for (const p of parsed) {
          if (!p) continue;
          const name = (p.name || p.cityName || p.city || p.label || "").trim();
          const lat = typeof p.lat === "number" ? p.lat : typeof p.latitude === "number" ? p.latitude : parseFloat(p.lat || p.latitude);
          const lng = typeof p.lng === "number" ? p.lng : typeof p.longitude === "number" ? p.longitude : parseFloat(p.lng || p.longitude);
          if (name.length > 0 && !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
            valid.push({ name, lat, lng });
          }
        }
        if (valid.length > 0) {
          return valid;
        }
      }
    }
  } catch (e) {
    console.error("Error reading saved places from localStorage:", e);
  }
  return DEFAULT_PLACES;
}

/**
 * Saves a place to localStorage while preserving the entire existing history.
 */
export function savePlace(place: SavedPlace): SavedPlace[] {
  const currentList = loadSavedPlacesFromStorage();
  const cleanName = place.name.split(',')[0].trim() || "Moja lokalizacja";
  const newLat = Number(place.lat);
  const newLng = Number(place.lng);

  if (isNaN(newLat) || isNaN(newLng)) {
    console.warn("savePlace: Invalid coordinates, place not saved:", place);
    return currentList;
  }

  const filtered = currentList.filter(p => !areLocationsEqual(p.lat, p.lng, newLat, newLng, p.name, cleanName));
  const updated = [...filtered, { name: cleanName, lat: newLat, lng: newLng }];
  
  try {
    localStorage.setItem("aura_saved_places", JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to persist aura_saved_places:", e);
  }

  return updated;
}

export default function SavedPlacesSection({ currentCity, currentLat, currentLng, onSelectPlace }: SavedPlacesProps) {
  const [places, setPlaces] = useState<SavedPlace[]>(() => loadSavedPlacesFromStorage());

  useEffect(() => {
    try {
      if (Array.isArray(places) && places.length > 0) {
        localStorage.setItem("aura_saved_places", JSON.stringify(places));
      }
    } catch (e) {
      console.error("Error saving places to localStorage:", e);
    }
  }, [places]);

  const isCurrentSaved = places.some(
    p => areLocationsEqual(p.lat, p.lng, currentLat, currentLng, p.name, currentCity)
  );

  const handleAddCurrent = () => {
    if (isCurrentSaved) return;
    const cleanName = currentCity.split(',')[0].trim() || "Moja lokalizacja";
    const newLat = Number(currentLat);
    const newLng = Number(currentLng);

    if (isNaN(newLat) || isNaN(newLng)) {
      console.warn("Cannot save place with invalid coordinates:", { currentLat, currentLng });
      return;
    }

    setPlaces(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const filtered = list.filter(p => !areLocationsEqual(p.lat, p.lng, newLat, newLng, p.name, cleanName));
      return [...filtered, { name: cleanName, lat: newLat, lng: newLng }];
    });
  };

  const handleRemove = (e: React.MouseEvent, lat: number, lng: number, name?: string) => {
    e.stopPropagation();
    setPlaces(prev => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter(p => !areLocationsEqual(p.lat, p.lng, lat, lng, p.name, name));
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-4 px-1" id="saved-places-selector">
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-2.5 px-1">
          <div className="flex items-center space-x-2">
            <Bookmark className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Moje Miejsca</span>
            <span className="text-[10px] font-medium text-slate-500">({places.length})</span>
          </div>

          {!isCurrentSaved && (
            <button
              onClick={handleAddCurrent}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/30 rounded-xl text-[11px] font-bold text-blue-300 transition-all active:scale-95 cursor-pointer"
              title="Zapisz bieżącą lokalizację do listy"
            >
              <Plus className="w-3 h-3" />
              <span>Zapisz tę lokalizację</span>
            </button>
          )}
        </div>

        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none touch-pan-x items-center">
          {places.map((place, idx) => {
            const isSelected = areLocationsEqual(place.lat, place.lng, currentLat, currentLng, place.name, currentCity);
            return (
              <div
                key={idx}
                onClick={() => onSelectPlace(place.lat, place.lng, place.name)}
                className={`group flex items-center space-x-2 px-3 py-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-400/60 shadow-md shadow-blue-500/20"
                    : "bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-slate-300 hover:text-white"
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <MapPin className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-blue-400 group-hover:scale-110 transition-transform"}`} />
                  <span className="text-xs font-semibold whitespace-nowrap">{place.name}</span>
                </div>

                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}

                {places.length > 1 && (
                  <button
                    onClick={(e) => handleRemove(e, place.lat, place.lng, place.name)}
                    className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all ml-1 ${
                      isSelected ? "hover:bg-blue-700/50 text-blue-100" : "hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                    }`}
                    title="Usuń z listy"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

