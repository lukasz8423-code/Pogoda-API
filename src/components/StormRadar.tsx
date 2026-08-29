import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Zap, 
  CloudRain, 
  RefreshCw, 
  AlertTriangle 
} from "lucide-react";
import { CurrentWeather, HourlyForecast, DailyForecast } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";
import { cachedFetch, CACHE_TTLS } from "../utils/cache";

export interface StormRadarProps {
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
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [radarHost, setRadarHost] = useState<string>("https://tilecache.rainviewer.com");

  const stormInfo = checkStormStatus(current, hourly);

  const hasPrecipOrStormAlert = Boolean(
    stormInfo.isStorm || 
    stormInfo.isStormRisk || 
    (current?.precipitation && current.precipitation > 0.1) ||
    (current?.weather_code && current.weather_code >= 51 && current.weather_code <= 99)
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(hasPrecipOrStormAlert);

  // Auto-start radar animation when precipitation or storm alert becomes active
  useEffect(() => {
    if (hasPrecipOrStormAlert) {
      setIsPlaying(true);
    }
  }, [hasPrecipOrStormAlert]);

  // 1. Fetch RainViewer Real-time Radar API metadata
  const fetchRainViewerMetadata = useCallback(async () => {
    setIsLoadingApi(true);
    setApiError(null);
    try {
      const data = await cachedFetch("rainviewer_metadata", async () => {
        const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        if (!res.ok) {
          throw new Error(`Błąd serwera RainViewer (${res.status})`);
        }
        return await res.json();
      }, CACHE_TTLS.RADAR);

      if (data && typeof data.host === "string" && data.host.trim().length > 0) {
        setRadarHost(data.host.trim());
      }

      const pastFrames: RadarFrame[] = Array.isArray(data?.radar?.past) ? data.radar.past : [];
      const nowcastFrames: RadarFrame[] = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
      
      const combined = [...pastFrames, ...nowcastFrames].filter(
        (f): f is RadarFrame => Boolean(f && typeof f.path === "string" && typeof f.time === "number")
      );

      if (combined.length > 0) {
        setFrames(combined);
        // Default to latest past frame (current observation time)
        const defaultIdx = pastFrames.length > 0 ? pastFrames.length - 1 : combined.length - 1;
        setActiveFrameIndex(defaultIdx);
      } else {
        setFrames([]);
        setApiError("Brak dostępnych klatek radarowych w usłudze RainViewer.");
      }
    } catch (err: any) {
      console.warn("⚠️ [StormRadar] Błąd pobierania danych z RainViewer API:", err);
      setFrames([]);
      setApiError("Chwilowy brak połączenia z serwerem radaru opadowego RainViewer.");
    } finally {
      setIsLoadingApi(false);
    }
  }, []);

  useEffect(() => {
    fetchRainViewerMetadata();
    const interval = setInterval(fetchRainViewerMetadata, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchRainViewerMetadata]);

  // 2. Initialize Leaflet Map (Single instance lifecycle)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const container = mapContainerRef.current;

    // Safeguard for React strict-mode double mount
    if ((container as any)._leaflet_id) {
      delete (container as any)._leaflet_id;
    }

    try {
      const map = L.map(container, {
        center: [lat, lng],
        zoom: 9,
        minZoom: 9,
        maxZoom: 9,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false
      });

      // Disable any remaining interactive controls
      if (map.dragging) map.dragging.disable();
      if (map.touchZoom) map.touchZoom.disable();
      if (map.doubleClickZoom) map.doubleClickZoom.disable();
      if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
      if (map.boxZoom) map.boxZoom.disable();
      if (map.keyboard) map.keyboard.disable();

      // Clean Dark Matter Basemap with legible city names & roads
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
        opacity: 0.95
      }).addTo(map);

      // Layer group for location markers & range circles
      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;

      mapInstanceRef.current = map;

      // Invalidate map size after layout transition
      const timer = setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 250);

      // ResizeObserver to automatically resize map when container size changes
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        });
        resizeObserver.observe(container);
      }

      return () => {
        clearTimeout(timer);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {
            console.warn("Leaflet cleanup notice:", e);
          }
          mapInstanceRef.current = null;
        }
        radarTileLayerRef.current = null;
        markersGroupRef.current = null;
      };
    } catch (err) {
      console.warn("Leaflet map initialization notice:", err);
    }
  }, []);

  // Update map view center when target coordinates change
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  // 3. Render Range Rings & Town Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 25km & 50km Radar Range Rings with subtle cyan styling
    const ring25 = L.circle([lat, lng], {
      radius: 25000,
      color: "#06b6d4",
      weight: 1.5,
      dashArray: "4, 6",
      fill: true,
      fillColor: "#06b6d4",
      fillOpacity: 0.02,
      opacity: 0.4
    });

    const ring50 = L.circle([lat, lng], {
      radius: 50000,
      color: "#0284c7",
      weight: 1.2,
      dashArray: "3, 8",
      fill: false,
      opacity: 0.3
    });

    group.addLayer(ring25);
    group.addLayer(ring50);

    // Subtle distance labels on range rings (north of center)
    const dist25Marker = L.marker([lat + 0.225, lng], {
      icon: L.divIcon({
        html: `<span class="px-1.5 py-0.5 rounded bg-slate-950/80 text-[9px] font-mono font-semibold text-cyan-300 border border-cyan-500/30">25 km</span>`,
        className: "dist-label",
        iconSize: [40, 16],
        iconAnchor: [20, 8]
      })
    });
    const dist50Marker = L.marker([lat + 0.45, lng], {
      icon: L.divIcon({
        html: `<span class="px-1.5 py-0.5 rounded bg-slate-950/80 text-[9px] font-mono font-semibold text-sky-400 border border-sky-500/30">50 km</span>`,
        className: "dist-label",
        iconSize: [40, 16],
        iconAnchor: [20, 8]
      })
    });
    group.addLayer(dist25Marker);
    group.addLayer(dist50Marker);

    // Center Location Marker (Clean glowing dot with label)
    const isStormActive = Boolean(stormInfo.isStorm);
    const centerHtml = `
      <div class="relative flex items-center justify-center">
        <span class="animate-ping absolute inline-flex h-7 w-7 rounded-full ${isStormActive ? 'bg-rose-500' : 'bg-cyan-400'} opacity-60"></span>
        <span class="relative inline-flex rounded-full h-3.5 w-3.5 ${isStormActive ? 'bg-rose-500 ring-4 ring-rose-500/30' : 'bg-cyan-400 ring-4 ring-cyan-400/30'}"></span>
        <div class="absolute top-4.5 whitespace-nowrap bg-slate-950/95 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg border border-cyan-400/40 shadow-xl backdrop-blur-md flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full ${isStormActive ? 'bg-rose-400 animate-pulse' : 'bg-cyan-400'}"></span>
          <span>${city}</span>
        </div>
      </div>
    `;

    const centerIcon = L.divIcon({
      html: centerHtml,
      className: "custom-center-marker",
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    group.addLayer(L.marker([lat, lng], { icon: centerIcon }));

    // If active storm, render storm cell lightning warning markers nearby
    if (stormInfo.isStorm || stormInfo.isStormRisk) {
      const stormOffsets = [
        { dLat: 0.08, dLng: 0.07 },
        { dLat: -0.06, dLng: 0.12 }
      ];

      stormOffsets.forEach((so) => {
        const sHtml = `
          <div class="animate-pulse flex items-center justify-center p-1.5 bg-amber-500 text-slate-950 rounded-full border-2 border-white shadow-lg shadow-amber-500/50">
            <svg class="w-3.5 h-3.5 fill-current text-slate-950" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
        `;
        const sIcon = L.divIcon({
          html: sHtml,
          className: "storm-cell-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        group.addLayer(L.marker([lat + so.dLat, lng + so.dLng], { icon: sIcon }));
      });
    }
  }, [lat, lng, city, stormInfo.isStorm, stormInfo.isStormRisk]);

  // 4. Update Radar Tile Overlay Layer when frame changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (frames.length === 0 || !frames[activeFrameIndex]) {
      if (radarTileLayerRef.current) {
        map.removeLayer(radarTileLayerRef.current);
        radarTileLayerRef.current = null;
      }
      return;
    }

    const currentFrame = frames[activeFrameIndex];
    const cleanHost = radarHost.replace(/\/$/, "");
    const cleanPath = currentFrame.path.startsWith("/") ? currentFrame.path : `/${currentFrame.path}`;

    // RainViewer Radar Tile URL schema: {host}{path}/{size}/{z}/{x}/{y}/{colorScheme}/{smooth}_{snow}.png
    const tileUrl = `${cleanHost}${cleanPath}/256/{z}/{x}/{y}/2/1_1.png`;

    const newLayer = L.tileLayer(tileUrl, {
      opacity: 0.75,
      maxNativeZoom: 7,
      maxZoom: 18,
      tileSize: 256,
      zIndex: 100
    });

    newLayer.addTo(map);

    const oldLayer = radarTileLayerRef.current;
    radarTileLayerRef.current = newLayer;

    if (oldLayer) {
      map.removeLayer(oldLayer);
    }
  }, [activeFrameIndex, frames, radarHost]);

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
    : "NA ŻYWO";

  return (
    <div 
      className="bg-gradient-to-b from-white/[0.08] to-white/[0.03] backdrop-blur-2xl border border-white/15 rounded-[32px] p-5 sm:p-6 mb-8 relative overflow-hidden shadow-xl max-w-4xl mx-auto" 
      id="storm-radar-section"
    >
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>

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
            className="p-2.5 rounded-2xl bg-white/[0.06] border border-white/12 text-slate-200 hover:text-white hover:bg-white/[0.12] transition-all active:scale-95 cursor-pointer backdrop-blur-md"
            title="Odśwież skan radaru"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingApi ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={frames.length === 0}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all active:scale-95 flex items-center space-x-2 border shadow-lg cursor-pointer ${
              isPlaying
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 border-cyan-400/50 text-white shadow-blue-500/30"
                : "bg-white/[0.08] border-white/15 text-slate-100 hover:bg-white/[0.15] disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
            id="btn-radar-play"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? "Pauza" : "Odtwarzaj"}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Leaflet Radar Map */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] rounded-[24px] bg-[#020617] border border-white/12 overflow-hidden shadow-2xl group z-10 select-none">
        <div
          ref={mapContainerRef}
          className="w-full h-full block z-0 pointer-events-none"
        />

        {/* Loading Overlay */}
        {isLoadingApi && frames.length === 0 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 text-center pointer-events-none">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
            <p className="text-xs font-bold text-white">Wczytywanie skanu radaru opadowego...</p>
            <p className="text-[10px] text-slate-400 mt-1">Pobieranie klatek z sieci radarów RainViewer</p>
          </div>
        )}

        {/* Error / Offline Overlay without fake data */}
        {apiError && frames.length === 0 && !isLoadingApi && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md p-6 text-center">
            <AlertTriangle className="w-9 h-9 text-amber-400 mb-2.5" />
            <p className="text-xs font-bold text-slate-100 max-w-xs">{apiError}</p>
            <button
              onClick={fetchRainViewerMetadata}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Spróbuj ponownie</span>
            </button>
          </div>
        )}

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
        <div className="mt-5 p-4 bg-white/[0.04] border border-white/10 rounded-2xl relative z-10 space-y-3 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-extrabold text-slate-300">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <CloudRain className="w-4 h-4 inline" /> Oś Czasu Opadów (Klatka {activeFrameIndex + 1} z {frames.length})
            </span>
            <span className="font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5 rounded-lg text-xs">
              {frameTimeStr}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveFrameIndex((prev) => (prev > 0 ? prev - 1 : frames.length - 1))}
              className="p-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.12] active:scale-90 cursor-pointer"
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
              className="p-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.12] active:scale-90 cursor-pointer"
              title="Następna klatka"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Meteorological Legend */}
      <div className="mt-4 p-4 bg-white/[0.04] border border-white/10 rounded-2xl relative z-10 backdrop-blur-md">
        <h4 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest mb-3">Legenda intensywności opadów</h4>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-cyan-400 rounded-sm"></div> <span>0.1-1 mm/h</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> <span>1-5 mm/h</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div> <span>5-15 mm/h</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> <span>&gt;15 mm/h</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 border border-dashed border-red-500 rounded-sm"></div> <span>Burza ⚡</span></div>
        </div>
      </div>
    </div>
  );
});

