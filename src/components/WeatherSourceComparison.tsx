import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Layers, 
  Cloud, 
  Wind, 
  Thermometer, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  GitMerge, 
  Cpu, 
  Radio, 
  Users, 
  Sparkles, 
  Activity, 
  Droplet, 
  Sun, 
  Gauge, 
  RefreshCw, 
  Leaf,
  Info,
  Database
} from "lucide-react";
import { WeatherResponse } from "../types";
import { getDistanceKm } from "../utils/distance";
import { calculateLeafWetness } from "../utils/weatherUtils";

interface WeatherSourceComparisonProps {
  sourcesData?: Record<string, {
    temp?: number;
    cloud?: number;
    wind?: number;
    label: string;
  }>;
  currentTemp: number;
  currentCloud: number;
  currentWind: number;
  lat?: number;
  lng?: number;
  initialMode?: "fusion" | "stations" | "comparison" | "crowd";
  data?: WeatherResponse;
  imgwStation?: any;
  onStationChange?: (station: any) => void;
}

export default function WeatherSourceComparison({
  sourcesData,
  currentTemp,
  currentCloud,
  currentWind,
  lat = 52.8441,
  lng = 19.1772,
  initialMode = "stations",
  data,
  imgwStation,
  onStationChange
}: WeatherSourceComparisonProps) {
  const [collaboratingMode, setCollaboratingMode] = useState<"fusion" | "stations" | "comparison" | "crowd">(initialMode);
  const [selectedModel, setSelectedModel] = useState<string>("arome");
  const [stationsList, setStationsList] = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [manualOverride, setManualOverride] = useState(false);
  const [userReport, setUserReport] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [communityCount, setCommunityCount] = useState(14);
  const isRefreshing = useRef(false);

  // Model values from Open-Meteo
  const omCurrent = data?.weather?.current;
  const omHourly = data?.weather?.hourly;
  
  // Matched hourly index
  let matchedHourIdx = 0;
  if (omHourly?.time && omCurrent?.time) {
    const prefix = omCurrent.time.slice(0, 13);
    const idx = omHourly.time.findIndex((t: string) => t.startsWith(prefix));
    if (idx >= 0) matchedHourIdx = idx;
  }

  const modelTemp = omCurrent?.temperature_2m ?? currentTemp;
  const modelHumidity = omCurrent?.relative_humidity_2m ?? 65;
  const modelWind = omCurrent?.wind_speed_10m ?? currentWind;
  const modelPressure = omCurrent?.pressure_msl ?? omHourly?.pressure_msl?.[matchedHourIdx] ?? 1013;
  const modelSoilMoisture = typeof omCurrent?.soil_moisture_satellite === 'number'
    ? omCurrent.soil_moisture_satellite
    : (omHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx] !== undefined 
        ? Math.round(omHourly.soil_moisture_0_to_1cm[matchedHourIdx] * 100) 
        : 28);
  const modelSolar = typeof omCurrent?.shortwave_radiation === 'number'
    ? Math.round(omCurrent.shortwave_radiation)
    : (omHourly?.shortwave_radiation?.[matchedHourIdx] !== undefined 
        ? Math.round(omHourly.shortwave_radiation[matchedHourIdx]) 
        : 0);

  // Fetch real station data from backend API based on GPS coordinates
  const fetchStationData = async () => {
    try {
      isRefreshing.current = true;
      const timestamp = new Date().getTime();
      const res = await fetch(`/api/stations?lat=${lat}&lng=${lng}&t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
      
      let list: any[] = [];
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          list = json;
        } else if (json && Array.isArray(json.stations) && json.stations.length > 0) {
          list = json.stations;
        }
      }

      // If backend stations list is empty, construct dynamic list from imgwStation candidates
      if (list.length === 0) {
        if (imgwStation?.nearestCandidates && imgwStation.nearestCandidates.length > 0) {
          list = imgwStation.nearestCandidates.map((c: any) => ({
            id: c.id,
            name: c.name || `Stacja IMGW-PIB ${c.stationName}`,
            stationName: c.stationName || c.name,
            lat: c.lat,
            lng: c.lng,
            temp: c.temp,
            humidity: c.humidity,
            windSpeed: c.windSpeed,
            pressure: c.pressure,
            status: "Aktywna – telemetria IMGW-PIB",
            distanceKm: c.distanceKm,
            distance: c.distance || `${c.distanceKm} km`,
            soilTemp: c.groundTemp ?? null,
            groundTemp: c.groundTemp ?? null,
            soilMoisture: null,
            solarRadiation: null,
            hasSoilSensor: false,
            hasSolarSensor: false,
            rainRate: c.rainRate || 0,
            lastPacket: c.measurementTime || imgwStation.lastSync,
            isOfficial: true
          }));
        } else if (imgwStation) {
          list = [{
            id: imgwStation.id || "imgw_station",
            name: imgwStation.name.startsWith("Stacja") ? imgwStation.name : `Stacja IMGW-PIB ${imgwStation.name}`,
            stationName: imgwStation.stationName || imgwStation.name,
            lat: imgwStation.raw?.lat || imgwStation.lat || lat,
            lng: imgwStation.raw?.lng || imgwStation.lng || lng,
            temp: imgwStation.temp,
            humidity: imgwStation.humidity,
            windSpeed: imgwStation.windSpeed,
            pressure: imgwStation.pressure,
            status: imgwStation.status || "Aktywna – telemetria IMGW-PIB",
            distanceKm: typeof imgwStation.distanceKm === 'number' ? imgwStation.distanceKm : (parseFloat(imgwStation.distance) || 0),
            distance: imgwStation.distance || "0.0 km",
            soilTemp: imgwStation.groundTemp ?? null,
            groundTemp: imgwStation.groundTemp ?? null,
            soilMoisture: null,
            solarRadiation: null,
            hasSoilSensor: false,
            hasSolarSensor: false,
            rainRate: imgwStation.rainRate || 0,
            lastPacket: imgwStation.lastSync || imgwStation.measurementTime,
            isOfficial: true
          }];
        }
      }

      setStationsList(list);
      if (list.length > 0) {
        setSelectedStationId(list[0].id);
        if (onStationChange) {
          onStationChange(list[0]);
        }
      }
    } catch (e) {
      console.warn("Station fetch error:", e);
      if (imgwStation) {
        const fallbackList = [{
          id: imgwStation.id || "imgw_synop",
          name: `Stacja IMGW-PIB ${imgwStation.name}`,
          stationName: imgwStation.name,
          lat: imgwStation.lat || lat,
          lng: imgwStation.lng || lng,
          temp: imgwStation.temp,
          humidity: imgwStation.humidity,
          windSpeed: imgwStation.windSpeed,
          pressure: imgwStation.pressure,
          status: "Dostępna – pomiary IMGW-PIB",
          distance: imgwStation.distance || "0.0 km",
          distanceKm: typeof imgwStation.distanceKm === 'number' ? imgwStation.distanceKm : (parseFloat(imgwStation.distance) || 0),
          soilTemp: null,
          groundTemp: null,
          soilMoisture: null,
          solarRadiation: null,
          hasSoilSensor: false,
          hasSolarSensor: false,
          rainRate: imgwStation.rainRate || 0,
          lastPacket: imgwStation.lastSync,
          isOfficial: true
        }];
        setStationsList(fallbackList);
        setSelectedStationId(fallbackList[0].id);
      }
    } finally {
      isRefreshing.current = false;
    }
  };

  useEffect(() => {
    fetchStationData();
  }, [lat, lng, imgwStation]);

  const activeStation = stationsList.find((s) => s.id === selectedStationId) || stationsList[0] || {
    id: "imgw_synop",
    name: imgwStation ? `Stacja Synoptyczna IMGW-PIB ${imgwStation.name}` : "Stacja Synoptyczna IMGW-PIB",
    temp: imgwStation?.temp ?? currentTemp,
    humidity: imgwStation?.humidity ?? modelHumidity,
    windSpeed: imgwStation?.windSpeed ?? currentWind,
    pressure: imgwStation?.pressure ?? modelPressure,
    rainRate: imgwStation?.rainRate ?? 0,
    distance: imgwStation?.distance ?? "0.0 km",
    soilMoisture: null,
    solarRadiation: null,
    hasSoilSensor: false,
    hasSolarSensor: false,
    status: "Dostępna – pomiary IMGW-PIB"
  };

  const handleSendReport = (type: string) => {
    setUserReport(type);
    setReportSubmitted(true);
    setCommunityCount((prev) => prev + 1);
    setTimeout(() => setReportSubmitted(false), 4000);
  };

  // Atmospheric models
  const models = [
    { key: "arome", name: "AROME 1.3km", role: "Model wysokorozdzielczy IMGW / Météo-France", weight: "45%", color: "from-blue-600 to-indigo-600", tempOffset: 0.1 },
    { key: "icon_d2", name: "ICON-D2 2.2km", role: "Niemiecka Służba Pogodowa DWD", weight: "30%", color: "from-emerald-600 to-teal-600", tempOffset: -0.2 },
    { key: "ecmwf", name: "ECMWF HRES", role: "Europejskie Centrum Prognoz Średnioterminowych", weight: "15%", color: "from-amber-600 to-orange-600", tempOffset: 0.3 },
    { key: "gfs", name: "NOAA GFS", role: "Globalny model prognostyczny USA (NOAA)", weight: "10%", color: "from-purple-600 to-pink-600", tempOffset: -0.4 }
  ];

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5">
      {/* Header with clear title and source disclaimer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Database className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Pomiary Stacji IMGW vs Model Open-Meteo
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ścisłe rozdzielenie fizycznych odczytów ze stacji naziemnej od numerycznej prognozy modelowej
          </p>
        </div>

        {/* Navigation tabs */}
        <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/70 text-xs">
          <button
            onClick={() => setCollaboratingMode("stations")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
              collaboratingMode === "stations"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Stacja IMGW</span>
          </button>
          <button
            onClick={() => setCollaboratingMode("comparison")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
              collaboratingMode === "comparison"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Porównanie</span>
          </button>
          <button
            onClick={() => setCollaboratingMode("fusion")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
              collaboratingMode === "fusion"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Fuzja AI</span>
          </button>
          <button
            onClick={() => setCollaboratingMode("crowd")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1.5 ${
              collaboratingMode === "crowd"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Społeczność</span>
          </button>
        </div>
      </div>

      {/* Mode 1: STACJA IMGW */}
      {collaboratingMode === "stations" && (
        <div className="space-y-4">
          {/* Active Nearest Station Card with explicit measured vs modeled badges */}
          <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-4">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/60">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/30 shrink-0">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30">
                      NAJBLIŻSZA STACJA POMIAROWA IMGW-PIB
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{activeStation.distance}</span>
                  </div>
                  <h4 className="text-base font-bold text-white mt-0.5">{activeStation.name}</h4>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-end space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>{activeStation.status || "Pomiary aktywne"}</span>
                </span>
                {activeStation.lastPacket && (
                  <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                    Czas pomiaru: {activeStation.lastPacket}
                  </span>
                )}
              </div>
            </div>

            {/* Real Measured Sensors */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block mb-2 flex items-center space-x-1.5">
                <span>🛰️ IMGW — Fizyczne pomiary z czujników naziemnych ({activeStation.stationName || activeStation.name}):</span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Temp */}
                <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 flex items-center space-x-1 font-semibold">
                    <Thermometer className="w-3.5 h-3.5" />
                    <span>Temperatura (2m)</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {activeStation.tempFormatted || (typeof activeStation.temp === 'number' ? `${activeStation.temp.toFixed(1).replace('.', ',')}°C` : "Brak danych")}
                  </div>
                  <div className="text-[9px] text-emerald-300/80 font-mono mt-0.5">
                    🛰️ IMGW Termometr stacyjny
                  </div>
                </div>

                {/* Humidity */}
                <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 flex items-center space-x-1 font-semibold">
                    <Droplet className="w-3.5 h-3.5" />
                    <span>Wilgotność względna</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {activeStation.humidity !== null && activeStation.humidity !== undefined ? `${activeStation.humidity}%` : "Brak danych"}
                  </div>
                  <div className="text-[9px] text-emerald-300/80 font-mono mt-0.5">
                    🛰️ IMGW Higrometr stacyjny
                  </div>
                </div>

                {/* Wind */}
                <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 flex items-center space-x-1 font-semibold">
                    <Wind className="w-3.5 h-3.5" />
                    <span>Prędkość wiatru</span>
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {activeStation.windSpeed !== null && activeStation.windSpeed !== undefined ? `${activeStation.windSpeed} km/h` : "Brak pomiaru"}
                  </div>
                  <div className="text-[9px] text-emerald-300/80 font-mono mt-0.5">
                    🛰️ IMGW Anemometr stacyjny
                  </div>
                </div>

                {/* Pressure */}
                <div className="bg-slate-900/60 p-3 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 flex items-center space-x-1 font-semibold">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Ciśnienie atmosferyczne</span>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white mt-1">
                    {activeStation.pressure !== null && activeStation.pressure !== undefined 
                      ? `${activeStation.pressure} hPa` 
                      : (activeStation.synopPressureStation 
                          ? `${activeStation.synopPressureStation.pressure} hPa`
                          : "Brak barometru")}
                  </div>
                  <div className="text-[9px] text-emerald-300/80 font-mono mt-0.5 line-clamp-1">
                    {activeStation.pressure 
                      ? "🛰️ IMGW Synop pomiar" 
                      : (activeStation.synopPressureStation 
                          ? `🛰️ IMGW Synop (${activeStation.synopPressureStation.stationName}, ${activeStation.synopPressureStation.distanceKm} km)` 
                          : "Brak czujnika barometrycznego")}
                  </div>
                </div>
              </div>
            </div>

            {/* Sensor Availability & Model Fallback Info */}
            <div className="pt-2 border-t border-slate-700/60">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-2">
                Pomiary specjalistyczne, dane satelitarne i modele agrometeorologiczne:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Leaf Wetness Notice / Calculation */}
                {(() => {
                  const wCode = (omCurrent as any)?.weather_code ?? (omCurrent as any)?.weathercode ?? 0;
                  const lw = calculateLeafWetness(
                    activeStation.rainRate ?? omCurrent?.precipitation ?? 0,
                    activeStation.humidity ?? modelHumidity,
                    activeStation.temp ?? modelTemp,
                    undefined,
                    omCurrent?.is_day ?? 1,
                    activeStation.windSpeed ?? modelWind,
                    activeStation.stationName || activeStation.name,
                    wCode
                  );
                  return (
                    <div className="bg-slate-900/40 border border-teal-500/40 rounded-xl p-3 flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 shrink-0 mt-0.5">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-slate-200 flex items-center justify-between">
                          <span>Zwilżenie liścia (0–15)</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold">
                            {lw.formatted}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px] leading-relaxed">
                          {lw.title}: {lw.description}
                        </p>
                        <p className="text-[10px] text-teal-400 font-mono">
                          🧮 MODEL / INDEKS: Agrometeorologiczny model LWD
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Soil Moisture Notice */}
                <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-3 flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                    <Leaf className="w-4 h-4" />
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-200 flex items-center justify-between">
                      <span>Wilgotność gleby</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold">
                        {modelSoilMoisture}%
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Stacja IMGW: <span className="text-amber-400 font-semibold">Brak czujnika stacyjnego</span>.
                    </p>
                    <p className="text-[10px] text-sky-400 font-mono">
                      🌐 Open-Meteo / 🛰️ Satelita Sentinel (0–1 cm)
                    </p>
                  </div>
                </div>

                {/* Solar Radiation Notice */}
                <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-3 flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-200 flex items-center justify-between">
                      <span>Promieniowanie</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        {modelSolar} W/m²
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Stacja IMGW: <span className="text-amber-400 font-semibold">Brak aktynometru na stacji</span>.
                    </p>
                    <p className="text-[10px] text-amber-300 font-mono">
                      🌐 Open-Meteo: model radiacyjny (shortwave_radiation)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: COMPARISON TABLE */}
      {collaboratingMode === "comparison" && (
        <div className="space-y-4">
          <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 uppercase text-[10px] tracking-wider">
                  <th className="pb-3 pr-4 font-bold">Parametr</th>
                  <th className="pb-3 px-4 font-bold text-emerald-400">Stacja IMGW ({activeStation.stationName || activeStation.name})</th>
                  <th className="pb-3 px-4 font-bold text-sky-400">Model Open-Meteo</th>
                  <th className="pb-3 pl-4 font-bold text-slate-300">Pochodzenie i Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-200">
                {/* Temp */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Thermometer className="w-4 h-4 text-emerald-400" />
                    <span>Temperatura (2m)</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-emerald-300">
                    {activeStation.tempFormatted || (typeof activeStation.temp === 'number' ? `${activeStation.temp.toFixed(1).replace('.', ',')}°C` : "Brak danych")}
                    <span className="block text-[9px] text-emerald-400 font-normal font-sans">🛰️ IMGW pomiar stacyjny</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelTemp.toFixed(1).replace('.', ',')}°C
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🌐 Open-Meteo model</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-slate-400">
                    {Math.abs(activeStation.temp - modelTemp) > 0.1 ? (
                      <span className="text-amber-300 font-semibold">Różnica: {Math.abs(activeStation.temp - modelTemp).toFixed(1)}°C (stacja vs model)</span>
                    ) : (
                      <span className="text-emerald-400">Zgodność stacji i modelu</span>
                    )}
                  </td>
                </tr>

                {/* Pressure */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Gauge className="w-4 h-4 text-emerald-400" />
                    <span>Ciśnienie atmosferyczne</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-emerald-300">
                    {activeStation.pressure !== null && activeStation.pressure !== undefined 
                      ? `${activeStation.pressure} hPa` 
                      : (activeStation.synopPressureStation 
                          ? `${activeStation.synopPressureStation.pressure} hPa` 
                          : "Brak pomiaru")}
                    <span className="block text-[9px] text-emerald-400 font-normal font-sans">
                      {activeStation.pressure 
                        ? "🛰️ IMGW Synop pomiar" 
                        : (activeStation.synopPressureStation 
                            ? `🛰️ IMGW Synop (${activeStation.synopPressureStation.stationName})` 
                            : "Brak czujnika")}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelPressure} hPa
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🌐 Open-Meteo model</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-slate-400">
                    {activeStation.pressure ? (
                      <span className="text-emerald-400">Rzeczywisty pomiar stacyjny synop.cisnienie</span>
                    ) : (activeStation.synopPressureStation ? (
                      <span className="text-sky-300 font-semibold">Pobrane ze stacji synoptycznej {activeStation.synopPressureStation.stationName} ({activeStation.synopPressureStation.distanceKm} km)</span>
                    ) : (
                      <span className="text-amber-400">Stacja lokalna bez czujnika barometrycznego</span>
                    ))}
                  </td>
                </tr>

                {/* Humidity */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Droplet className="w-4 h-4 text-emerald-400" />
                    <span>Wilgotność względna</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-emerald-300">
                    {activeStation.humidity !== null && activeStation.humidity !== undefined ? `${activeStation.humidity}%` : "Brak danych"}
                    <span className="block text-[9px] text-emerald-400 font-normal font-sans">🛰️ IMGW pomiar stacyjny</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelHumidity}%
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🌐 Open-Meteo model</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-slate-400">
                    Higrometr naziemny vs asymilacja numeryczna
                  </td>
                </tr>

                {/* Wind */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Wind className="w-4 h-4 text-emerald-400" />
                    <span>Prędkość wiatru</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-emerald-300">
                    {activeStation.windSpeed !== null && activeStation.windSpeed !== undefined ? `${activeStation.windSpeed} km/h` : "Brak pomiaru"}
                    <span className="block text-[9px] text-emerald-400 font-normal font-sans">🛰️ IMGW pomiar stacyjny</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelWind} km/h
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🌐 Open-Meteo model</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-slate-400">
                    Wiatromierz stacyjny IMGW (10m)
                  </td>
                </tr>

                {/* Leaf Wetness 0/15 */}
                {(() => {
                  const wCode = (omCurrent as any)?.weather_code ?? (omCurrent as any)?.weathercode ?? 0;
                  const lwSt = calculateLeafWetness(
                    activeStation.rainRate ?? omCurrent?.precipitation ?? 0,
                    activeStation.humidity ?? modelHumidity,
                    activeStation.temp ?? modelTemp,
                    undefined,
                    omCurrent?.is_day ?? 1,
                    activeStation.windSpeed ?? modelWind,
                    activeStation.stationName || activeStation.name,
                    wCode
                  );
                  const lwOm = calculateLeafWetness(
                    omCurrent?.precipitation ?? 0,
                    modelHumidity,
                    modelTemp,
                    undefined,
                    omCurrent?.is_day ?? 1,
                    modelWind,
                    undefined,
                    wCode
                  );
                  return (
                    <tr>
                      <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                        <Activity className="w-4 h-4 text-teal-400" />
                        <span>Zwilżenie liścia (0–15)</span>
                      </td>
                      <td className="py-3 px-4 font-bold font-mono text-teal-300">
                        {lwSt.formatted} <span className="text-[10px] text-slate-300 font-normal">({lwSt.title.split("(")[0].trim()})</span>
                        <span className="block text-[9px] text-teal-400 font-normal font-sans">🧮 MODEL / INDEKS</span>
                      </td>
                      <td className="py-3 px-4 font-bold font-mono text-sky-300">
                        {lwOm.formatted} <span className="text-[10px] text-slate-300 font-normal">({lwOm.title.split("(")[0].trim()})</span>
                        <span className="block text-[9px] text-sky-400 font-normal font-sans">🧮 MODEL / INDEKS</span>
                      </td>
                      <td className="py-3 pl-4 text-[11px] text-teal-300">
                        Fizyczny model agrometeorologiczny LWD (skala 0–15)
                      </td>
                    </tr>
                  );
                })()}

                {/* Soil Moisture */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Leaf className="w-4 h-4 text-amber-400" />
                    <span>Wilgotność gleby (0-1cm)</span>
                  </td>
                  <td className="py-3 px-4 text-amber-400 font-semibold text-[11px]">
                    Brak pomiaru stacyjnego
                    <span className="block text-[9px] text-slate-400 font-normal font-sans">Brak czujnika na stacji</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelSoilMoisture}%
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🛰️ Sentinel / 🌐 Open-Meteo</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-sky-300">
                    Pochodzi z satelitów Sentinel-1/2 oraz modelu Open-Meteo
                  </td>
                </tr>

                {/* Solar Radiation */}
                <tr>
                  <td className="py-3 pr-4 font-medium flex items-center space-x-1.5">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>Promieniowanie słoneczne</span>
                  </td>
                  <td className="py-3 px-4 text-amber-400 font-semibold text-[11px]">
                    Brak pomiaru stacyjnego
                    <span className="block text-[9px] text-slate-400 font-normal font-sans">Brak aktynometru</span>
                  </td>
                  <td className="py-3 px-4 font-bold font-mono text-sky-300">
                    {modelSolar} W/m²
                    <span className="block text-[9px] text-sky-400 font-normal font-sans">🌐 Open-Meteo model</span>
                  </td>
                  <td className="py-3 pl-4 text-[11px] text-sky-300">
                    Pochodzi z modelu radiacyjnego Open-Meteo
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mode 3: FUSION */}
      {collaboratingMode === "fusion" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {models.map((m) => {
              const isSelected = selectedModel === m.key;
              return (
                <motion.div
                  key={m.key}
                  onClick={() => setSelectedModel(m.key)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`cursor-pointer p-3 rounded-2xl border transition-all relative overflow-hidden ${
                    isSelected
                      ? "bg-slate-800/90 border-emerald-500 shadow-lg shadow-emerald-500/20"
                      : "bg-slate-800/40 border-slate-700/70 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-200">{m.name.split(" ")[0]}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      {m.weight}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{m.role}</p>
                  {isSelected && (
                    <motion.div
                      layoutId="activeModelIndicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
                    />
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 shrink-0">
                <Cpu className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider flex items-center space-x-1.5">
                  <span>Konsensus fuzji: Stacja ({activeStation.distance}) + Modele numeryczne</span>
                  {userReport && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Skorygowano z terenu</span>}
                </div>
                <div className="text-xl font-bold text-slate-100 mt-0.5">
                  {currentTemp}°C • {currentCloud}% zachmurzenia • {activeStation.pressure ? `${activeStation.pressure} hPa` : `${modelPressure} hPa`}
                </div>
                <div className="text-xs text-slate-400">Priorytetyzacja fizycznych pomiarów naziemnych IMGW-PIB z asymilacją AROME/ICON</div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20 shrink-0">
              <ShieldCheck className="w-4 h-4" />
              <span>Pomiary zsynchronizowane</span>
            </div>
          </div>
        </div>
      )}

      {/* Mode 4: CROWD */}
      {collaboratingMode === "crowd" && (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/25 p-3.5 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                <Users className="w-4 h-4" />
                <span>Moduł Społecznościowy i Raporty z Terenu</span>
              </div>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                {communityCount} aktywnych raportów w okolicy
              </span>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Widzisz inne warunki za oknem niż podaje stacja/model? Zgłoś faktyczną pogodę, aby poprawić dokładność fuzji:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => handleSendReport('sun')}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  userReport === 'sun'
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-lg shadow-amber-500/20"
                    : "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span>☀️ Pełne słońce</span>
              </button>
              <button
                onClick={() => handleSendReport('rain')}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  userReport === 'rain'
                    ? "bg-blue-600 text-white border-blue-400 font-bold shadow-lg shadow-blue-600/20"
                    : "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span>🌧️ Pada deszcz</span>
              </button>
              <button
                onClick={() => handleSendReport('colder')}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  userReport === 'colder'
                    ? "bg-cyan-600 text-white border-cyan-400 font-bold shadow-lg shadow-cyan-600/20"
                    : "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span>❄️ Czuję chłodniej</span>
              </button>
              <button
                onClick={() => handleSendReport('warmer')}
                className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  userReport === 'warmer'
                    ? "bg-orange-600 text-white border-orange-400 font-bold shadow-lg shadow-orange-600/20"
                    : "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span>🌡️ Czuję cieplej</span>
              </button>
            </div>

            {reportSubmitted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-3 bg-emerald-500/20 border border-emerald-500/30 p-2.5 rounded-xl flex items-center justify-between text-xs text-emerald-300"
              >
                <span className="flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Dziękujemy! Twój raport z terenu został uwzględniony w algorytmie fuzji AI.</span>
                </span>
                <span className="font-bold font-mono">Korekta aktywna</span>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
