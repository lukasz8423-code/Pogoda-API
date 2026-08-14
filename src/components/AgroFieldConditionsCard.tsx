import React from "react";
import { Sprout, Wind, Sun, Thermometer, Droplet, Activity } from "lucide-react";
import { CurrentWeather, WeatherResponse } from "../types";

interface AgroFieldConditionsCardProps {
  current?: CurrentWeather;
  data?: WeatherResponse;
  selectedStation?: {
    id: string;
    name: string;
    soilMoisture?: number;
    [key: string]: any;
  } | null;
}

export default React.memo(function AgroFieldConditionsCard({ current: currentProp, data, selectedStation }: AgroFieldConditionsCardProps) {
  const current = currentProp || data?.weather?.current;
  if (!current) return null;

  const temp = typeof current.temperature_2m === 'number' ? current.temperature_2m : null;
  const humidity = typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null;
  const wind = typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : null;
  const uv = typeof current.uv_index === 'number' ? current.uv_index : null;

  // Bind soil moisture directly to station telemetry if selected, otherwise fallback to satellite/model
  let rawMoisture: number;
  if (selectedStation && typeof selectedStation.soilMoisture === 'number') {
    rawMoisture = selectedStation.soilMoisture;
  } else if (typeof current.soil_moisture_satellite === 'number') {
    rawMoisture = current.soil_moisture_satellite;
  } else if (data?.weather?.hourly?.soil_moisture_0_to_1cm?.[0] !== undefined) {
    rawMoisture = data.weather.hourly.soil_moisture_0_to_1cm[0];
  } else {
    rawMoisture = 13;
  }

  const soilMoisturePercent = Math.round(
    Math.min(100, Math.max(1, rawMoisture > 1 ? rawMoisture : rawMoisture * 100))
  );

  const safeTemp = temp ?? 15;
  const safeHum = humidity ?? 50;
  const safeWind = wind ?? 10;
  const safeUv = uv ?? 0;

  // Bind Soil Temp & Solar Radiation directly to station telemetry if selected, or model
  const soilTemp = selectedStation?.soilTemp !== undefined 
    ? selectedStation.soilTemp 
    : (current.soil_temperature_10cm ?? Math.round(safeTemp > 0 ? safeTemp - 1.5 : safeTemp));

  // Solar radiation calculation: strictly 0 at night (is_day === 0)
  let solarRadiation = 0;
  if (selectedStation?.solarRadiation !== undefined) {
    solarRadiation = selectedStation.solarRadiation;
  } else if (current.is_day === 1) {
    if (typeof current.shortwave_radiation === 'number' && current.shortwave_radiation >= 0) {
      solarRadiation = Math.round(current.shortwave_radiation);
    } else {
      solarRadiation = Math.round((safeUv || 0) * 80);
    }
  }

  const stationShortName = selectedStation ? selectedStation.name.split(" ")[0] : null;

  // Estimate Evapotranspiration (Parowanie gleby w mm/dzień)
  const vaporDeficit = ((100 - safeHum) / 100) * (safeTemp > 0 ? safeTemp / 10 : 0.5);
  const evaporationRate = Math.min(12, Math.max(0.5, (vaporDeficit * 2.2 + (safeWind / 15) + (safeUv * 0.4))));
  
  // Determine Agro Verdict
  let verdictTitle = "";
  let verdictDescription = "";
  let badgeColor = "";
  let statusBadge = "";

  if (soilMoisturePercent < 25 && evaporationRate > 5.5) {
    verdictTitle = "Ekstremalna susza – silne parowanie!";
    verdictDescription = "Gleba jest bardzo przesuszona, a wysoka temperatura i wiatr powodują gwałtowną utratę wilgoci. Konieczne obfite podlewanie!";
    badgeColor = "bg-red-500/20 text-red-300 border-red-500/40";
    statusBadge = "Ekstremalny brak wody";
  } else if (soilMoisturePercent < 40 && evaporationRate > 4) {
    verdictTitle = "Umiarkowana susza glebowa";
    verdictDescription = "Podwyższona ewapotranspiracja. Prace plenerowe sprzyjające, jednak młode rośliny mogą wymagać nawadniania.";
    badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
    statusBadge = "Zalecane nawadnianie";
  } else if (wind > 28) {
    verdictTitle = "Ograniczone prace plenerowe (Silny wiatr)";
    verdictDescription = `Wiatr o prędkości ${Math.round(wind)} km/h uniemożliwia bezpieczne opryski i precyzyjne prace ogrodnicze.`;
    badgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/40";
    statusBadge = "Silny wiatr";
  } else if (soilMoisturePercent > 80) {
    verdictTitle = "Przewilgocenie gleby – zastoiska wodne";
    verdictDescription = "Gleba nasycona wodą. Utrudniony wjazd ciężkiego sprzętu i ryzyko gnicia korzeni.";
    badgeColor = "bg-blue-500/20 text-blue-300 border-blue-500/40";
    statusBadge = "Nasycenie wodą";
  } else {
    verdictTitle = "Dobre warunki do pracy w plenerze";
    verdictDescription = "Optymalny poziom wilgotności gleby i umiarkowane parowanie. Idealny czas na prace w ogrodzie i na polu.";
    badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    statusBadge = "Warunki optymalne";
  }

  return (
    <div className="w-full p-4 rounded-3xl bg-slate-900/60 border border-emerald-500/30 backdrop-blur-md shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 shrink-0">
            <Sprout className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">Status Agro & Gwarancja Plonów</span>
              {selectedStation && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                  Stacja {stationShortName}
                </span>
              )}
            </div>
            <h3 className="text-sm font-extrabold text-white">Warunki Polowe & Susza</h3>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeColor}`}>
            {statusBadge}
          </span>
        </div>
      </div>

      {/* Primary Verdict Callout */}
      <div className="p-3 bg-black/30 rounded-2xl border border-white/10 mb-4">
        <h4 className="text-xs font-bold text-emerald-200 flex items-center space-x-1.5">
          <span>🌱 {verdictTitle}</span>
        </h4>
        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          {verdictDescription}
        </p>
      </div>

      {/* Grid Indicators - Complete Agro Tile Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Tile 1: Wilgotność gleby */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Droplet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Wilgotność gleby</span>
          </div>
          <span className="text-base font-black text-white">{soilMoisturePercent}%</span>
          <p className="text-[9px] text-emerald-300 font-mono mt-1" title={selectedStation ? `Stacja ${selectedStation.name}` : "Satelita Sentinel/SMOS"}>
            {selectedStation?.soilMoisture !== undefined ? `Stacja ${stationShortName}` : "Model Satelity"}
          </p>
        </div>

        {/* Tile 2: Temp. gleby 10 cm */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            <span>Temp. gleby 10 cm</span>
          </div>
          <span className="text-base font-black text-white">{soilTemp}°C</span>
          <p className="text-[9px] text-amber-300 font-mono mt-1" title={selectedStation ? `Stacja ${selectedStation.name}` : "Model Prognozy GFS"}>
            {selectedStation?.soilTemp !== undefined ? `Stacja ${stationShortName}` : "Model GFS"}
          </p>
        </div>

        {/* Tile 3: Promieniowanie Słoneczne */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5 text-amber-300" />
            <span>Promieniowanie</span>
          </div>
          <span className="text-base font-black text-white">{solarRadiation} W/m²</span>
          <p className="text-[9px] text-amber-400 font-mono mt-1" title={selectedStation ? `Stacja ${selectedStation.name}` : "Model Indeksu UV"}>
            {selectedStation?.solarRadiation !== undefined ? `Stacja ${stationShortName}` : `UV ${uv}`}
          </p>
        </div>

        {/* Tile 4: Zwilżenie liścia */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span>Zwilżenie liścia</span>
          </div>
          <span className="text-base font-black text-white">
            {selectedStation?.leafWetnessText 
              ? selectedStation.leafWetnessText.split(" ")[0] 
              : current.precipitation && current.precipitation > 0 ? "12/15" : humidity > 85 ? "4/15" : "0/15"}
          </span>
          <p className="text-[9px] text-teal-300 font-mono mt-1">
            {selectedStation ? `Stacja ${stationShortName}` : humidity > 85 ? "Rosa poranna" : "Stan liścia"}
          </p>
        </div>

        {/* Tile 5: Szybkość parowania */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5 text-orange-400" />
            <span>Parowanie gleby</span>
          </div>
          <span className="text-base font-black text-white">{evaporationRate.toFixed(1)} mm/d</span>
          <p className="text-[9px] text-orange-300 font-mono mt-1">Ewapotranspiracja</p>
        </div>

        {/* Tile 6: Wiatr w łanie */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Wind className="w-3.5 h-3.5 text-cyan-400" />
            <span>Wiatr w łanie</span>
          </div>
          <span className="text-base font-black text-white">
            {Math.round((selectedStation?.windSpeed ?? wind) * 0.7)} km/h
          </span>
          <p className="text-[9px] text-cyan-300 font-mono mt-1">Tłumienie roślin</p>
        </div>
      </div>
    </div>
  );
})
