import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { Play, Pause, SkipBack, SkipForward, Layers, Compass, ZoomIn, ZoomOut, Zap, CloudRain, RefreshCw, AlertTriangle } from "lucide-react";
import { CurrentWeather, HourlyForecast, DailyForecast } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";

interface StormRadarProps {
  current?: CurrentWeather;
  hourly?: HourlyForecast;
  daily?: DailyForecast;
  lat?: number;
  lng?: number;
  city?: string;
}

interface RadarFrame {
  time: number;
  path: string;
}

export default React.memo(function StormRadar({
  current,
  hourly,
  lat = 52.8441,
  lng = 19.1772,
  city = "Lipno"
}: StormRadarProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const radarTileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);
  const [activeLayerType, setActiveLayerType] = useState<"radar" | "satellite">("radar");
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(true);
  const [radarHost, setRadarHost] = useState<string>("https://tilecache.rainviewer.com");

  const stormInfo = checkStormStatus(current, hourly);

  const hasPrecipOrStormAlert = Boolean(
    stormInfo.isStorm || 
    stormInfo.isStormRisk || 
    (current?.precipitation && current.precipitation > 0.1) ||
    (current?.weather_code && current.weather_code >= 51 && current.weather_code <= 99)
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(hasPrecipOrStormAlert);

  // Auto-start radar animation ONLY when precipitation or storm alert turns active
  useEffect(() => {
    setIsPlaying(hasPrecipOrStormAlert);
  }, [hasPrecipOrStormAlert]);

  // 1. Fetch RainViewer Real-time Radar API metadata
  const fetchRainViewerMetadata = async () => {
    setIsLoadingApi(true);
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();

      if (data && data.host) {
        setRadarHost(data.host);
      }

      const pastFrames: RadarFrame[] = data?.radar?.past || [];
      const nowcastFrames: RadarFrame[] = data?.radar?.nowcast || [];
      const combined = [...pastFrames, ...nowcastFrames];

      if (combined.length > 0) {
        setFrames(combined);
        // Default to latest past frame (current time frame)
        const latestPastIdx = pastFrames.length > 0 ? pastFrames.length - 1 : combined.length - 1;
        setActiveFrameIndex(latestPastIdx);
      }
    } catch (err) {
      console.warn("Nie udało się pobrać klatek RainViewer, używanie fallbacku:", err);
      // Fallback timestamps for last 1 hour
      const nowTs = Math.floor(Date.now() / 1000);
      const fallbackFrames: RadarFrame[] = [];
      for (let i = 6; i >= 0; i--) {
        fallbackFrames.push({
          time: nowTs - i * 600,
          path: `/v2/radar/${nowTs - i * 600}`
        });
      }
      setFrames(fallbackFrames);
      setActiveFrameIndex(fallbackFrames.length - 1);
    } finally {
      setIsLoadingApi(false);
    }
  };

  useEffect(() => {
    fetchRainViewerMetadata();
    const interval = setInterval(fetchRainViewerMetadata, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Already initialized

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 9,
      zoomControl: false,
      attributionControl: false
    });

    // Dark Basemap Tiles (CartoDB Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      subdomains: "abcd",
    }).addTo(map);

    // Layer group for location markers & range circles
    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    mapInstanceRef.current = map;

    // Force map size refresh after render animation
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng]);

  // Update map view when center coordinates change
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom());
    }
  }, [lat, lng]);

  // 3. Render Range Rings & Town Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 25km & 50km Radar Range Rings
    const ring25 = L.circle([lat, lng], {
      radius: 25000,
      color: "#38bdf8",
      weight: 1,
      dashArray: "4, 6",
      fill: false,
      opacity: 0.35
    });

    const ring50 = L.circle([lat, lng], {
      radius: 50000,
      color: "#38bdf8",
      weight: 1,
      dashArray: "2, 8",
      fill: false,
      opacity: 0.2
    });

    group.addLayer(ring25);
    group.addLayer(ring50);

    // Center Location Marker (Pulsating Dot)
    const centerHtml = `
      <div class="relative flex items-center justify-center">
        <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full ${stormInfo.isStorm ? 'bg-red-500' : 'bg-cyan-400'} opacity-75"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 ${stormInfo.isStorm ? 'bg-red-600 border-2 border-white' : 'bg-cyan-400 border-2 border-slate-900'}"></span>
        <div class="absolute top-5 whitespace-nowrap bg-slate-950/90 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-md border border-cyan-500/40 shadow-xl backdrop-blur-md uppercase tracking-wider">
          🎯 ${city.toUpperCase()}
        </div>
      </div>
    `;

    const centerIcon = L.divIcon({
      html: centerHtml,
      className: "custom-center-marker",
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const centerMarker = L.marker([lat, lng], { icon: centerIcon });
    group.addLayer(centerMarker);

    // Nearby towns around Lipno/Target Region
    const localTowns = [
      { name: "Kikół", dLat: 0.12, dLng: -0.08 },
      { name: "Skępe", dLat: -0.02, dLng: 0.18 },
      { name: "Karnkowo", dLat: 0.08, dLng: 0.12 },
      { name: "Bobrowniki", dLat: -0.12, dLng: -0.15 },
      { name: "Radomice", dLat: -0.09, dLng: 0.06 },
      { name: "Włocławek", dLat: -0.19, dLng: -0.11 },
      { name: "Rypin", dLat: 0.22, dLng: 0.24 },
      { name: "Toruń", dLat: 0.18, dLng: -0.42 }
    ];

    localTowns.forEach(t => {
      const townLat = lat + t.dLat;
      const townLng = lng + t.dLng;

      const townHtml = `
        <div class="flex items-center space-x-1 bg-slate-900/80 px-1.5 py-0.5 rounded border border-white/10 text-[9px] font-bold text-slate-300 backdrop-blur-sm whitespace-nowrap shadow">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          <span>${t.name}</span>
        </div>
      `;

      const townIcon = L.divIcon({
        html: townHtml,
        className: "custom-town-marker",
        iconSize: [80, 20],
        iconAnchor: [40, 10]
      });

      group.addLayer(L.marker([townLat, townLng], { icon: townIcon }));
    });

    // If active storm, render storm cell lightning warning markers nearby
    if (stormInfo.isStorm || stormInfo.isStormRisk) {
      const stormOffsets = [
        { dLat: 0.05, dLng: 0.04 },
        { dLat: -0.04, dLng: 0.08 },
        { dLat: 0.02, dLng: -0.06 }
      ];

      stormOffsets.forEach((so, i) => {
        const sHtml = `
          <div class="animate-bounce flex items-center justify-center p-1 bg-amber-500/90 text-slate-950 rounded-full border-2 border-white shadow-lg shadow-amber-500/50">
            <svg class="w-4 h-4 fill-current text-slate-950 animate-pulse" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
        `;
        const sIcon = L.divIcon({
          html: sHtml,
          className: "storm-cell-marker",
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        group.addLayer(L.marker([lat + so.dLat, lng + so.dLng], { icon: sIcon }));
      });
    }

  }, [lat, lng, city, stormInfo.isStorm, stormInfo.isStormRisk]);

  // 4. Update Radar Tile Overlay Layer when frame or mode changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove existing layer if any
    if (radarTileLayerRef.current) {
      map.removeLayer(radarTileLayerRef.current);
      radarTileLayerRef.current = null;
    }

    if (frames.length === 0) return;

    const currentFrame = frames[activeFrameIndex];
    if (!currentFrame) return;

    // RainViewer Radar Tile URL schema
    // host + path + /256/{z}/{x}/{y}/2/1_1.png
    const tileUrl = `${radarHost}${currentFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    const newLayer = L.tileLayer(tileUrl, {
      opacity: 0.72,
      maxNativeZoom: 7,
      maxZoom: 18,
      tileSize: 256
    });

    newLayer.addTo(map);
    radarTileLayerRef.current = newLayer;

  }, [activeFrameIndex, frames, radarHost, activeLayerType]);

  // 5. Animation Player Loop
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const timer = setInterval(() => {
      setActiveFrameIndex((prev) => (prev + 1) % frames.length);
    }, 1200);

    return () => clearInterval(timer);
  }, [isPlaying, frames.length]);

  const currentFrame = frames[activeFrameIndex];
  const frameTimeStr = currentFrame
    ? new Date(currentFrame.time * 1000).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    : "LIVE";

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  return (
    <div className="bg-slate-950/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 mb-8 relative overflow-hidden shadow-2xl" id="storm-radar-section">
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="relative flex h-3.5 w-3.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              stormInfo.isStorm ? "bg-red-400" : stormInfo.isStormRisk ? "bg-amber-400" : "bg-emerald-400"
            }`}></span>
            <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
              stormInfo.isStorm ? "bg-red-500" : stormInfo.isStormRisk ? "bg-amber-500" : "bg-emerald-500"
            }`}></span>
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              <span>Radar Opadowy & Burzowy POLRAD</span>
              <span className="text-[10px] bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded-md text-red-300 font-extrabold uppercase tracking-wider">
                NA ŻYWO
              </span>
            </h3>
            <p className="text-xs font-semibold text-slate-300 mt-0.5 flex items-center gap-1.5">
              <span>{stormInfo.title}</span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-slate-400 font-mono text-[11px]">{city}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={fetchRainViewerMetadata}
            disabled={isLoadingApi}
            className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all active:scale-90"
            title="Odśwież skan radaru"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingApi ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all active:scale-95 flex items-center space-x-2 border shadow-lg ${
              isPlaying
                ? "bg-blue-600 border-blue-400 text-white shadow-blue-500/30"
                : "bg-white/10 border-white/20 text-slate-200 hover:bg-white/20"
            }`}
            id="btn-radar-play"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? "Pauza" : "Odtwarzaj"}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Leaflet Radar Map */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] rounded-[24px] bg-[#020617] border border-white/10 overflow-hidden shadow-2xl group z-10">
        <div
          ref={mapContainerRef}
          className="w-full h-full block z-0"
        />

        {/* Live Status Overlay Badge */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 pointer-events-none">
          <div className={`px-3 py-1.5 rounded-2xl backdrop-blur-md border text-[11px] font-black uppercase tracking-wider flex items-center gap-2 shadow-xl ${
            stormInfo.isStorm
              ? "bg-red-950/90 border-red-500/60 text-red-300 animate-pulse"
              : stormInfo.isStormRisk
              ? "bg-amber-950/90 border-amber-500/50 text-amber-300"
              : "bg-slate-950/80 border-cyan-500/30 text-cyan-300"
          }`}>
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{stormInfo.isStorm ? "AKTYWNA BURZA Z WYŁADOWANIAMI" : stormInfo.isStormRisk ? "RYZYKO CHMUR BURZOWYCH" : "OBSZAR RADARU POLRAD"}</span>
          </div>
        </div>

        {/* Map Zoom Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          <button
            onClick={handleZoomIn}
            className="p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-white/10 text-white rounded-xl backdrop-blur-md transition-all active:scale-90 shadow-lg"
            title="Przybliż"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2.5 bg-slate-950/80 hover:bg-slate-800 border border-white/10 text-white rounded-xl backdrop-blur-md transition-all active:scale-90 shadow-lg"
            title="Oddal"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Time Stamp overlay */}
        <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-slate-950/90 border border-white/15 rounded-2xl backdrop-blur-md z-20 shadow-xl">
          <span className="text-[11px] font-black text-white font-mono tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            CZAS RADARU: <span className="text-cyan-300">{frameTimeStr}</span>
          </span>
        </div>
      </div>

      {/* Radar Timeline Slider Controls */}
      {frames.length > 0 && (
        <div className="mt-5 p-4 bg-black/40 border border-white/10 rounded-2xl relative z-10 space-y-3">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-300">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <CloudRain className="w-4 h-4 inline" /> Oś Czasu Opadów (Klatka {activeFrameIndex + 1} z {frames.length})
            </span>
            <span className="font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
              {frameTimeStr}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveFrameIndex((prev) => (prev > 0 ? prev - 1 : frames.length - 1))}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 active:scale-90"
              title="Poprzednia klatka"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={activeFrameIndex}
              onChange={(e) => {
                setActiveFrameIndex(Number(e.target.value));
                setIsPlaying(false);
              }}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />

            <button
              onClick={() => setActiveFrameIndex((prev) => (prev + 1) % frames.length)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 active:scale-90"
              title="Następna klatka"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Meteorological Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-2xl relative z-10">
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-extrabold">
          <div className="flex items-center gap-1.5 text-slate-300">
            <div className="w-3 h-3 bg-cyan-400/80 rounded-sm"></div>
            <span>Mżawka</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <div className="w-3 h-3 bg-emerald-500/90 rounded-sm"></div>
            <span>Lekki deszcz</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
            <span>Umiarkowany</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span>Ulewa / Burza ⚡</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
          <Compass className="w-4 h-4" />
          <span>POLRAD IMGW &bull; RainViewer API</span>
        </div>
      </div>
    </div>
  );
});
