import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from "react-leaflet";
import L from "leaflet";
import { Cloud, Droplets, Sun, Wind, Compass, MapPin } from "lucide-react";

// Custom Leaflet marker for user location
const customIcon = L.divIcon({
  className: "custom-leaflet-marker",
  html: `<div style="background-color: #2563eb; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 20px rgba(37, 99, 235, 0.7); display: flex; align-items: center; justify-content: center; color: white; animation: pulse-marker 2s infinite;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

interface WeatherMapProps {
  latitude: number;
  longitude: number;
  cityName: string;
  cloudCover: number;
  precipitation: number;
  temperature: number;
  conditionText: string;
}

function MapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 10, { animate: false });
    
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);

    const t1 = setTimeout(() => { map.invalidateSize(); }, 50);
    const t2 = setTimeout(() => { map.invalidateSize(); }, 200);
    const t3 = setTimeout(() => { map.invalidateSize(); }, 500);

    return () => {
      observer.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [lat, lng, map]);
  return null;
}

export default function WeatherMap({
  latitude,
  longitude,
  cityName,
  cloudCover,
  precipitation,
  temperature,
  conditionText
}: WeatherMapProps) {
  const [overlayType, setOverlayType] = useState<"none" | "clouds" | "precipitation">("none");

  const lat = latitude || 52.237;
  const lng = longitude || 21.017;

  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center space-x-2">
            <Compass className="w-5 h-5 text-blue-400" />
            <span>Mapa pogody w czasie rzeczywistym</span>
          </h2>
          <p className="text-xs text-slate-400">
            Lokalizacja stacji: <strong className="text-slate-200">{cityName}</strong> ({lat.toFixed(3)}°N, {lng.toFixed(3)}°E)
          </p>
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700">
          <button
            onClick={() => setOverlayType("none")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center space-x-1.5 ${
              overlayType === "none"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Standard</span>
          </button>
          <button
            onClick={() => setOverlayType("clouds")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center space-x-1.5 ${
              overlayType === "clouds"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Chmury ({cloudCover}%)</span>
          </button>
          <button
            onClick={() => setOverlayType("precipitation")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center space-x-1.5 ${
              overlayType === "precipitation"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Opady</span>
          </button>
        </div>
      </div>

      <div className="w-full h-[400px] sm:h-[450px] rounded-2xl overflow-hidden border border-slate-700/80 relative z-10 shadow-inner">
        <MapContainer
          key={`map-${lat}-${lng}-${overlayType}`}
          center={[lat, lng]}
          zoom={10}
          scrollWheelZoom={true}
          style={{ width: "100%", height: "100%", background: "#0f172a" }}
        >
          <MapController lat={lat} lng={lng} />
          
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />

          {overlayType === "clouds" && (
            <TileLayer
              url="https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=b1b15e88fa797225412429c1c50c122a1"
              opacity={0.6}
              maxZoom={19}
            />
          )}

          {overlayType === "precipitation" && (
            <TileLayer
              url="https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=b1b15e88fa797225412429c1c50c122a1"
              opacity={0.7}
              maxZoom={19}
            />
          )}

          <Circle
            center={[lat, lng]}
            radius={2500}
            pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.15, color: '#2563eb', weight: 1.5 }}
          />

          <Marker position={[lat, lng]} icon={customIcon}>
            <Popup>
              <div className="p-2 text-slate-900 font-sans min-w-[180px]">
                <div className="font-bold text-sm text-slate-900 border-b pb-1 mb-1.5 flex items-center justify-between">
                  <span>{cityName} (Twoja lokalizacja)</span>
                  <span className="text-blue-600 font-bold">{temperature}°C</span>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  <div>Warunki: <strong>{conditionText}</strong></div>
                  <div>Zachmurzenie: <strong>{cloudCover}%</strong></div>
                  <div>Opady: <strong>{precipitation} mm/h</strong></div>
                  <div className="text-[10px] text-slate-500 pt-1 border-t mt-1">GPS: {lat.toFixed(4)}, {lng.toFixed(4)}</div>
                </div>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400 bg-slate-800/50 px-3.5 py-2 rounded-xl border border-slate-700/50">
        <div className="flex items-center space-x-2 text-blue-400 font-medium">
          <MapPin className="w-3.5 h-3.5" />
          <span>Lokalizacja aktywna: {cityName}</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Warstwa: <strong className="text-slate-200 uppercase">{overlayType === 'none' ? 'Standardowa' : overlayType}</strong></span>
          <span className="text-emerald-400 font-medium flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>GPS OK</span>
          </span>
        </div>
      </div>
    </div>
  );
}

