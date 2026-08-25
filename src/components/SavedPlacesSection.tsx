import React, { useState, useEffect } from "react";
import { Bookmark, MapPin, Plus, Trash2 } from "lucide-react";

interface SavedPlace {
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

const DEFAULT_PLACES: SavedPlace[] = [
  { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
  { name: "Kraków", lat: 50.0647, lng: 19.9450 },
  { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
  { name: "Wrocław", lat: 51.1079, lng: 17.0385 }
];

export default function SavedPlacesSection({ currentCity, currentLat, currentLng, onSelectPlace }: SavedPlacesProps) {
  const [places, setPlaces] = useState<SavedPlace[]>(() => {
    try {
      const stored = localStorage.getItem("aura_saved_places");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(
            (p: any) =>
              p &&
              typeof p.name === "string" &&
              p.name.trim().length > 0 &&
              typeof p.lat === "number" &&
              typeof p.lng === "number" &&
              !isNaN(p.lat) &&
              !isNaN(p.lng)
          );
          if (valid.length > 0) {
            return valid;
          }
        }
      }
    } catch (e) {
      console.error("Error reading saved places:", e);
    }
    return DEFAULT_PLACES;
  });

  useEffect(() => {
    try {
      if (Array.isArray(places) && places.length > 0) {
        localStorage.setItem("aura_saved_places", JSON.stringify(places));
      }
    } catch (e) {
      console.error("Error saving places:", e);
    }
  }, [places]);

  const isCurrentSaved = places.some(
    p => Math.abs(p.lat - currentLat) < 0.01 && Math.abs(p.lng - currentLng) < 0.01
  );

  const handleAddCurrent = () => {
    if (isCurrentSaved) return;
    const cleanName = currentCity.split(',')[0].trim() || "Moja lokalizacja";
    const newPlaces = [...places, { name: cleanName, lat: currentLat, lng: currentLng }];
    setPlaces(newPlaces);
  };

  const handleRemove = (e: React.MouseEvent, lat: number, lng: number) => {
    e.stopPropagation();
    const newPlaces = places.filter(p => !(Math.abs(p.lat - lat) < 0.01 && Math.abs(p.lng - lng) < 0.01));
    setPlaces(newPlaces);
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
            const isSelected = Math.abs(place.lat - currentLat) < 0.01 && Math.abs(place.lng - currentLng) < 0.01;
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
                    onClick={(e) => handleRemove(e, place.lat, place.lng)}
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
