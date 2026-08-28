import React from "react";
import { Sprout, Wind, Sun, Thermometer, Droplet, Activity, Info } from "lucide-react";
import { CurrentWeather, WeatherResponse } from "../types";
import { calculateLeafWetness } from "../utils/weatherUtils";

interface AgroFieldConditionsCardProps {
  current?: CurrentWeather;
  data?: WeatherResponse;
  selectedStation?: {
    id: string;
    name: string;
    stationName?: string;
    temp?: number | null;
    humidity?: number | null;
    windSpeed?: number | null;
    rainRate?: number | null;
    soilMoisture?: number | null;
    soilTemp?: number | null;
    solarRadiation?: number | null;
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
  const precip = typeof current.precipitation === 'number' ? current.precipitation : 0;

  const stationShortName = selectedStation ? (selectedStation.stationName || selectedStation.name.split(" ")[0]) : null;

  // Soil moisture source attribution
  let rawMoisture: number | null = null;
  let moistureSource = "Model Open-Meteo / Satelita Sentinel (0-1 cm)";

  // Find current hour index for hourly data
  const currentHourIdx = data?.weather?.hourly?.time ? 
    data.weather.hourly.time.findIndex((t: string) => {
      const d = new Date(t);
      const now = new Date();
      return d.getHours() === now.getHours() && d.getDate() === now.getDate();
    }) : 0;

  if (selectedStation && typeof selectedStation.soilMoisture === 'number') {
    rawMoisture = selectedStation.soilMoisture;
    moistureSource = `Czujnik stacyjny IMGW ${stationShortName}`;
  } else if (typeof current.soil_moisture_satellite === 'number') {
    rawMoisture = current.soil_moisture_satellite;
    moistureSource = "Satelita Sentinel / Model Open-Meteo";
  } else if (data?.weather?.hourly?.soil_moisture_0_to_1cm?.[currentHourIdx >= 0 ? currentHourIdx : 0] !== undefined) {
    rawMoisture = data.weather.hourly.soil_moisture_0_to_1cm[currentHourIdx >= 0 ? currentHourIdx : 0];
    moistureSource = "Model Open-Meteo (0-1 cm)";
  }

  const hasMoisture = rawMoisture !== null && !isNaN(rawMoisture);
  const soilMoisturePercent = hasMoisture ? Math.round(
    Math.min(100, Math.max(0, rawMoisture! > 1 ? rawMoisture! : rawMoisture! * 100))
  ) : null;

  const safeTemp = temp ?? 15;
  const safeHum = humidity ?? 50;
  const safeWind = wind ?? 10;
  const safeUv = uv ?? 0;

  // Soil Temperature
  const soilTemp = selectedStation?.soilTemp !== undefined && selectedStation.soilTemp !== null
    ? selectedStation.soilTemp 
    : (typeof current.soil_temperature_10cm === 'number' 
        ? current.soil_temperature_10cm 
        : (data?.weather?.hourly?.soil_temperature_0cm?.[currentHourIdx >= 0 ? currentHourIdx : 0] !== undefined
            ? Math.round(data.weather.hourly.soil_temperature_0cm[currentHourIdx >= 0 ? currentHourIdx : 0] * 10) / 10
            : null));

  const soilTempSource = selectedStation?.soilTemp !== undefined && selectedStation.soilTemp !== null
    ? `Czujnik gruntu IMGW ${stationShortName}`
    : "Model Open-Meteo / GFS (0 cm)";

  // Solar radiation calculation
  let solarRadiation: number | null = null;
  let solarSource = "Model radiacyjny Open-Meteo";
  if (selectedStation?.solarRadiation !== undefined && typeof selectedStation.solarRadiation === 'number') {
    solarRadiation = Math.round(selectedStation.solarRadiation);
    solarSource = `Aktynometr IMGW ${stationShortName}`;
  } else if (typeof current.shortwave_radiation === 'number') {
    solarRadiation = Math.round(current.shortwave_radiation);
    solarSource = "Model radiacyjny Open-Meteo";
  } else if (data?.weather?.hourly?.shortwave_radiation?.[currentHourIdx >= 0 ? currentHourIdx : 0] !== undefined) {
    solarRadiation = Math.round(data.weather.hourly.shortwave_radiation[currentHourIdx >= 0 ? currentHourIdx : 0]);
    solarSource = "Model radiacyjny Open-Meteo";
  } else if (current.is_day === 0) {
    solarRadiation = 0;
    solarSource = "0 W/m² (Noc astronomiczna)";
  } else {
    solarRadiation = Math.round((safeUv || 1) * 85);
    solarSource = "Estymacja UV";
  }

  // Calculate Leaf Wetness (Zwilżenie liścia w skali 0-15)
  const effectiveTemp = (selectedStation?.temp !== null && selectedStation?.temp !== undefined) ? selectedStation.temp : safeTemp;
  const effectiveHum = (selectedStation?.humidity !== null && selectedStation?.humidity !== undefined) ? selectedStation.humidity : safeHum;
  const effectiveRain = (selectedStation?.rainRate !== null && selectedStation?.rainRate !== undefined && selectedStation.rainRate > 0) ? selectedStation.rainRate : precip;
  const weatherCode = (current as any).weather_code ?? (current as any).weathercode ?? (current as any).weatherCode ?? data?.weather?.current?.weather_code ?? 0;

  const leafWetness = calculateLeafWetness(
    effectiveRain,
    effectiveHum,
    effectiveTemp,
    undefined,
    current.is_day ?? 1,
    selectedStation?.windSpeed ?? safeWind,
    stationShortName || undefined,
    weatherCode
  );

  // Estimate Evapotranspiration (Parowanie gleby w mm/dzień)
  const vaporDeficit = ((100 - safeHum) / 100) * (safeTemp > 0 ? safeTemp / 10 : 0.5);
  const evaporationRate = Math.min(12, Math.max(0.5, (vaporDeficit * 2.2 + (safeWind / 15) + (safeUv * 0.4))));
  
  // Determine Agro Verdict
  let verdictTitle = "";
  let verdictDescription = "";
  let badgeColor = "";
  let statusBadge = "";

  if (soilMoisturePercent !== null && soilMoisturePercent < 25 && evaporationRate > 5.5) {
    verdictTitle = "Ekstremalna susza – silne parowanie!";
    verdictDescription = "Gleba jest bardzo przesuszona, a wysoka temperatura i wiatr powodują gwałtowną utratę wilgoci. Konieczne obfite podlewanie!";
    badgeColor = "bg-red-500/20 text-red-300 border-red-500/40";
    statusBadge = "Ekstremalny brak wody";
  } else if (soilMoisturePercent !== null && soilMoisturePercent < 40 && evaporationRate > 4) {
    verdictTitle = "Umiarkowana susza glebowa";
    verdictDescription = "Podwyższona ewapotranspiracja. Prace plenerowe sprzyjające, jednak młode rośliny mogą wymagać nawadniania.";
    badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
    statusBadge = "Zalecane nawadnianie";
  } else if (wind !== null && wind > 28) {
    verdictTitle = "Ograniczone prace plenerowe (Silny wiatr)";
    verdictDescription = `Wiatr o prędkości ${Math.round(wind)} km/h uniemożliwia bezpieczne opryski i precyzyjne prace ogrodnicze.`;
    badgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/40";
    statusBadge = "Silny wiatr";
  } else if (soilMoisturePercent !== null && soilMoisturePercent > 80) {
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
            <h3 className="text-sm font-extrabold text-white">Warunki Polowe, Zwilżenie Liścia & Susza</h3>
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
          <span className="text-base font-black text-white">{soilMoisturePercent !== null ? `${soilMoisturePercent}%` : "Brak danych"}</span>
          <p className="text-[9px] text-emerald-300 font-mono mt-1" title={moistureSource}>
            {moistureSource}
          </p>
        </div>

        {/* Tile 2: Temp. gleby 10 cm */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            <span>Temp. gleby 10 cm</span>
          </div>
          <span className="text-base font-black text-white">{soilTemp !== null ? `${soilTemp}°C` : "Brak danych"}</span>
          <p className="text-[9px] text-amber-300 font-mono mt-1" title={soilTempSource}>
            {soilTempSource}
          </p>
        </div>

        {/* Tile 3: Promieniowanie Słoneczne */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Sun className="w-3.5 h-3.5 text-amber-300" />
            <span>Promieniowanie</span>
          </div>
          <span className="text-base font-black text-white">{solarRadiation !== null ? `${solarRadiation} W/m²` : "Brak danych"}</span>
          <p className="text-[9px] text-amber-400 font-mono mt-1" title={solarSource}>
            {solarSource}
          </p>
        </div>

        {/* Tile 4: Zwilżenie liścia 0/15 */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-center flex flex-col justify-between">
          <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span>Zwilżenie liścia</span>
          </div>
          <span className="text-base font-black text-teal-300 font-mono">
            {leafWetness.formatted}
          </span>
          <p className="text-[9px] text-teal-300 font-medium mt-1 leading-tight" title={leafWetness.description}>
            {leafWetness.title.split("(")[0].trim()}
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
            {Math.round(((selectedStation?.windSpeed ?? wind) || 0) * 0.7)} km/h
          </span>
          <p className="text-[9px] text-cyan-300 font-mono mt-1">Tłumienie roślin</p>
        </div>
      </div>

      {/* Detailed Leaf Wetness & Pathogen Risk Guide */}
      <div className="mt-3 p-3 bg-teal-950/30 rounded-2xl border border-teal-500/30 flex items-start space-x-3">
        <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 shrink-0 mt-0.5">
          <Activity className="w-4 h-4" />
        </div>
        <div className="text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-teal-200">
              Parametr: Zwilżenie blaszki liściowej ({leafWetness.formatted})
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold">
              Skala Agrometeo 0–15
            </span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {leafWetness.description}
          </p>
          <div className="text-[10px] text-teal-400/80 font-mono pt-0.5">
            Źródło: {leafWetness.source}
          </div>
        </div>
      </div>
    </div>
  );
})
