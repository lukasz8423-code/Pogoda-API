import React, { useState } from 'react';
import { 
  Activity, 
  Cpu, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Copy, 
  Check, 
  Droplet, 
  Sun, 
  Gauge, 
  Thermometer, 
  ChevronDown, 
  ChevronUp,
  FileCode,
  Sparkles,
  MapPin,
  Compass,
  Radio
} from 'lucide-react';
import { ApiFieldDiagnostic, WeatherResponse } from '../types';
import { getDistanceKm } from '../utils/distance';

interface Props {
  data: WeatherResponse;
  userLat?: number;
  userLng?: number;
}

export const ApiDataFlowDiagnosticsCard: React.FC<Props> = ({ data, userLat, userLng }) => {
  const [copied, setCopied] = useState(false);
  const [expandedParam, setExpandedParam] = useState<string | null>(null);

  const effectiveLat = userLat ?? data?.lat ?? 52.8441;
  const effectiveLng = userLng ?? data?.lng ?? 19.1772;

  // IMGW stations dynamically passed from live API via Haversine sorting
  const calculatedCandidates = React.useMemo(() => {
    const rawCandidates = data?.imgwStation?.candidates || data?.imgwStation?.nearestCandidates || [];
    if (rawCandidates.length > 0) {
      return rawCandidates.slice(0, 10);
    }

    if (data?.imgwStation) {
      return [{
        id: data.imgwStation.id,
        name: data.imgwStation.name,
        stationName: data.imgwStation.name,
        lat: data.imgwStation.lat || effectiveLat,
        lng: data.imgwStation.lng || effectiveLng,
        distanceKm: typeof data.imgwStation.distanceKm === 'number' ? data.imgwStation.distanceKm : 0,
        distance: data.imgwStation.distance || "0.0 km",
        temp: data.imgwStation.temp,
        humidity: data.imgwStation.humidity,
        windSpeed: data.imgwStation.windSpeed,
        pressure: data.imgwStation.pressure,
        rainRate: data.imgwStation.rainRate,
        measurementTime: data.imgwStation.lastSync
      }];
    }

    return [];
  }, [effectiveLat, effectiveLng, data?.imgwStation]);

  const rawOmCurrent = data?.weather?.current;
  const rawOmHourly = data?.weather?.hourly;

  // Derive hour index
  let matchedHourIdx = 0;
  if (rawOmHourly?.time && rawOmCurrent?.time) {
    const prefix = rawOmCurrent.time.slice(0, 13);
    const idx = rawOmHourly.time.findIndex((t: string) => t.startsWith(prefix));
    if (idx >= 0) matchedHourIdx = idx;
  }

  // Diagnostic items definition
  const diagnosticsList: ApiFieldDiagnostic[] = data?.apiDiagnostics || [
    {
      paramName: "soil_moisture_0_to_1cm",
      label: "Wilgotność gleby (0-1 cm)",
      apiField: `hourly.soil_moisture_0_to_1cm[${matchedHourIdx}]`,
      rawApiValue: rawOmHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx] ?? rawOmCurrent?.soil_moisture_satellite ?? "Brak w JSON",
      rawApiType: typeof (rawOmHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx]) === 'number' ? 'number (m³/m³)' : 'undefined',
      calculatedValue: typeof rawOmCurrent?.soil_moisture_satellite === 'number' 
        ? `${rawOmCurrent.soil_moisture_satellite}%` 
        : (rawOmHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx] !== undefined 
            ? `${Math.round(rawOmHourly.soil_moisture_0_to_1cm[matchedHourIdx] * 100)}%` 
            : "25% (domyślna)"),
      calculationFormula: "raw <= 1.0 ? Math.round(raw * 100) : raw (m³/m³ na % objętości)",
      uiComponentValue: typeof rawOmCurrent?.soil_moisture_satellite === 'number' ? `${rawOmCurrent.soil_moisture_satellite}%` : "Brak",
      uiRenderLocations: [
        "MainWeather.tsx (Linia 1311: <Aura Fusion 3D Top-Bar>)",
        "MainWeather.tsx (Linia 1462: <Hydro-Status / Gleba Sentinel>)",
        "AdditionalWeatherParameters.tsx (Linia 27: <Kafel Wilgotność gleby>)",
        "AgroFieldConditionsCard.tsx (Linia 42: <Stan wilgotności gleby & Retencja>)",
        "WeatherSourceComparison.tsx (Linia 90: <Porównanie Stacji Agro>)"
      ],
      status: rawOmHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx] !== undefined || typeof rawOmCurrent?.soil_moisture_satellite === 'number' ? 'ok' : 'warning'
    },
    {
      paramName: "shortwave_radiation",
      label: "Promieniowanie słoneczne",
      apiField: `current.shortwave_radiation / hourly.shortwave_radiation[${matchedHourIdx}]`,
      rawApiValue: rawOmCurrent?.shortwave_radiation ?? rawOmHourly?.shortwave_radiation?.[matchedHourIdx] ?? "Brak",
      rawApiType: typeof (rawOmCurrent?.shortwave_radiation ?? rawOmHourly?.shortwave_radiation?.[matchedHourIdx]) === 'number' ? 'number (W/m²)' : 'undefined',
      calculatedValue: typeof rawOmCurrent?.shortwave_radiation === 'number'
        ? `${Math.round(rawOmCurrent.shortwave_radiation)} W/m²`
        : (rawOmCurrent?.is_day === 0 ? "0 W/m² (Noc)" : `${Math.round((rawOmCurrent?.uv_index || 1) * 85)} W/m²`),
      calculationFormula: "Math.round(raw) (dla is_day === 0 wymuszone 0 W/m²)",
      uiComponentValue: typeof rawOmCurrent?.shortwave_radiation === 'number' ? `${Math.round(rawOmCurrent.shortwave_radiation)} W/m²` : "0 W/m²",
      uiRenderLocations: [
        "MainWeather.tsx (Linia 1489: <Helio-Atmosfera / Promieniowanie>)",
        "AdditionalWeatherParameters.tsx (Linia 26: <Kafel Promieniowanie>)",
        "AgroFieldConditionsCard.tsx (Linia 68: <Nasłonecznienie & Aktywność Fotosyntezy>)",
        "MeteoLcdConsole.tsx (Linia 112: <SOLAR RAD & Klux>)"
      ],
      status: typeof rawOmCurrent?.shortwave_radiation === 'number' || typeof rawOmHourly?.shortwave_radiation?.[matchedHourIdx] === 'number' ? 'ok' : 'warning'
    },
    {
      paramName: "pressure_msl",
      label: "Ciśnienie atmosferyczne (MSL)",
      apiField: `current.pressure_msl / hourly.pressure_msl[${matchedHourIdx}]`,
      rawApiValue: rawOmCurrent?.pressure_msl ?? rawOmHourly?.pressure_msl?.[matchedHourIdx] ?? "Brak",
      rawApiType: typeof (rawOmCurrent?.pressure_msl ?? rawOmHourly?.pressure_msl?.[matchedHourIdx]) === 'number' ? 'number (hPa)' : 'undefined',
      calculatedValue: typeof rawOmCurrent?.pressure_msl === 'number' ? `${Math.round(rawOmCurrent.pressure_msl)} hPa` : "1013 hPa",
      calculationFormula: "Math.round(raw || 1013) (zredukowane do poziomu morza)",
      uiComponentValue: typeof rawOmCurrent?.pressure_msl === 'number' ? `${Math.round(rawOmCurrent.pressure_msl)} hPa` : "1013 hPa",
      uiRenderLocations: [
        "MainWeather.tsx (Linia 1411: <Aero-Kinetyka / Barometr>)",
        "AdditionalWeatherParameters.tsx (Linia 21: <Kafel Ciśnienie>)",
        "DeviceSensorsCard.tsx (Linia 16: <Barometr cyfrowy / MSL>)",
        "MeteoLcdConsole.tsx (Linia 101: <BARO / hPa>)"
      ],
      status: typeof rawOmCurrent?.pressure_msl === 'number' || typeof rawOmHourly?.pressure_msl?.[matchedHourIdx] === 'number' ? 'ok' : 'warning'
    },
    {
      paramName: "temperature_2m",
      label: "Temperatura powietrza (2m)",
      apiField: `current.temperature_2m / hourly.temperature_2m[${matchedHourIdx}]`,
      rawApiValue: rawOmCurrent?.temperature_2m ?? rawOmHourly?.temperature_2m?.[matchedHourIdx] ?? "Brak",
      rawApiType: typeof (rawOmCurrent?.temperature_2m) === 'number' ? 'number (°C)' : 'undefined',
      calculatedValue: typeof rawOmCurrent?.temperature_2m === 'number' ? `${rawOmCurrent.temperature_2m}°C (zaokr. ${Math.round(rawOmCurrent.temperature_2m)}°)` : "Brak",
      calculationFormula: "Math.round(raw) na głównym ekranie, dokładna wartość dziesiętna w telemetrii",
      uiComponentValue: typeof rawOmCurrent?.temperature_2m === 'number' ? `${Math.round(rawOmCurrent.temperature_2m)}°` : "Brak",
      uiRenderLocations: [
        "MainWeather.tsx (Linia 1366: <Główny Termometr 3D>)",
        "MainWeather.tsx (Linia 1603: <Pasek prognozy godzinowej>)",
        "AdditionalWeatherParameters.tsx",
        "WeatherSourceComparison.tsx (Linia 200: <Porównanie modeli ICON/ECMWF/IMGW>)"
      ],
      status: typeof rawOmCurrent?.temperature_2m === 'number' ? 'ok' : 'warning'
    },
    {
      paramName: "apparent_temperature",
      label: "Temperatura odczuwalna",
      apiField: `current.apparent_temperature / hourly.apparent_temperature[${matchedHourIdx}]`,
      rawApiValue: rawOmCurrent?.apparent_temperature ?? rawOmHourly?.apparent_temperature?.[matchedHourIdx] ?? "Brak",
      rawApiType: typeof (rawOmCurrent?.apparent_temperature) === 'number' ? 'number (°C)' : 'undefined',
      calculatedValue: typeof rawOmCurrent?.apparent_temperature === 'number' ? `${rawOmCurrent.apparent_temperature}°C (zaokr. ${Math.round(rawOmCurrent.apparent_temperature)}°)` : "Brak",
      calculationFormula: "Kombinacja temperatury 2m, wilgotności względnej (RH) i prędkości wiatru (Wind Chill / Humidex)",
      uiComponentValue: typeof rawOmCurrent?.apparent_temperature === 'number' ? `Odczuwalna: ${Math.round(rawOmCurrent.apparent_temperature)}°` : "Brak",
      uiRenderLocations: [
        "MainWeather.tsx (Linia 1369: <Termometria 3D / Odczuwalna>)",
        "HeatStressTomorrowCard.tsx",
        "MeteoLcdConsole.tsx (Linia 100: <FEELS LIKE>)"
      ],
      status: typeof rawOmCurrent?.apparent_temperature === 'number' ? 'ok' : 'warning'
    }
  ];

  const handleCopyJson = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      city: data?.city,
      coordinates: { lat: userLat || data?.lat, lng: userLng || data?.lng },
      currentRaw: rawOmCurrent,
      hourlySampleMatched: {
        time: rawOmHourly?.time?.[matchedHourIdx],
        soil_moisture_0_to_1cm: rawOmHourly?.soil_moisture_0_to_1cm?.[matchedHourIdx],
        shortwave_radiation: rawOmHourly?.shortwave_radiation?.[matchedHourIdx],
        pressure_msl: rawOmHourly?.pressure_msl?.[matchedHourIdx],
        temperature_2m: rawOmHourly?.temperature_2m?.[matchedHourIdx],
        apparent_temperature: rawOmHourly?.apparent_temperature?.[matchedHourIdx]
      },
      diagnostics: diagnosticsList
    };

    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-2xl text-left" id="api-diagnostics-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-500/20 border border-indigo-500/40 rounded-2xl">
            <Cpu className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              Diagnostyka Przepływu Danych API
              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full font-bold uppercase">
                Live Data Inspector
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Pełny ślad telemetryczny: Od surowego pola Open-Meteo do komponentu UI
            </p>
          </div>
        </div>

        <button
          onClick={handleCopyJson}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 transition-all self-start sm:self-auto cursor-pointer active:scale-95"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
          <span>{copied ? "Skopiowano JSON" : "Kopiuj raport API"}</span>
        </button>
      </div>

      {/* Wyjaśnienie rozbieżności temperatury */}
      <div className="mb-6 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 text-indigo-300 font-bold">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Dlaczego temperatura w aplikacji może wynosić 26°C, a w innych źródłach 24–25°C?</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          1. <strong>Zaokrąglanie matematyczne w UI:</strong> Jeśli model Open-Meteo (DWD ICON-EU) wyliczy dla współrzędnych np. <code className="text-indigo-200">25.5°C</code> lub <code className="text-indigo-200">25.6°C</code>, widok główny zaokrągla wartość całkowitą do <code className="text-white font-bold">26°</code>.
        </p>
        <p className="text-slate-400 leading-relaxed">
          2. <strong>Różnica modeli i siatek numerycznych:</strong> Open-Meteo korzysta z modelu mezoskalowego ICON (rozdzielczość 2 km), podczas gdy inne aplikacje mogą odpytywać GFS, ECMWF lub lokalne stacje naziemne (IMGW Synop) mające kilkudziesięciominutowy cykl pomiarowy.
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] font-mono text-indigo-200">
          <span>Surowa temp. Open-Meteo: <strong>{rawOmCurrent?.temperature_2m ?? "—"}°C</strong></span>
          <span>•</span>
          <span>Odczuwalna Open-Meteo: <strong>{rawOmCurrent?.apparent_temperature ?? "—"}°C</strong></span>
          {data?.imgwStation && (
            <>
              <span>•</span>
              <span>Stacja IMGW ({data.imgwStation.name}): <strong>{data.imgwStation.temp}°C</strong></span>
            </>
          )}
        </div>
      </div>

      {/* Diagnostyka Wyboru Stacji IMGW (Top 5 Najbliższych dla GPS) */}
      <div className="mb-6 bg-slate-950/60 border border-emerald-500/30 rounded-2xl p-4 text-xs text-slate-300 space-y-3 shadow-inner">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-emerald-300 font-black tracking-tight">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="uppercase text-[11px]">Diagnostyka wyboru stacji IMGW-PIB (Wzór Haversine)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
            <MapPin className="w-3.5 h-3.5 text-rose-400" />
            <span>Aktualny GPS: <strong className="text-white">{effectiveLat.toFixed(4)}°N, {effectiveLng.toFixed(4)}°E</strong></span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Algorytm dynamicznie porównuje współrzędne GPS z bazą 62 oficjalnych stacji synoptycznych IMGW-PIB, oblicza rzeczywistą odległość w linii prostej i wybiera stację o minimalnym dystansie.
        </p>

        {/* Tabela TOP 5 kandydatów */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <th className="py-2 px-2">Poz.</th>
                <th className="py-2 px-2">Stacja IMGW</th>
                <th className="py-2 px-2">Współrzędne</th>
                <th className="py-2 px-2">Odległość GPS</th>
                <th className="py-2 px-2">Temp / Ciśnienie</th>
                <th className="py-2 px-2 text-right">Status wyboru</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {calculatedCandidates.map((cand, idx) => {
                const isSelected = idx === 0;
                return (
                  <tr 
                    key={cand.id} 
                    className={`transition-colors ${isSelected ? 'bg-emerald-500/10 font-bold' : 'hover:bg-white/[0.02]'}`}
                  >
                    <td className="py-2.5 px-2 font-mono">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${isSelected ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-white/10 text-slate-400'}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={isSelected ? 'text-emerald-300 font-bold' : 'text-white'}>
                        {cand.stationName || cand.name}
                      </span>
                      <span className="text-[9px] text-slate-500 block font-mono">ID: {cand.id}</span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-slate-400 text-[10px]">
                      {cand.lat.toFixed(4)}°N, {cand.lng.toFixed(4)}°E
                    </td>
                    <td className="py-2.5 px-2 font-mono font-bold">
                      <span className={isSelected ? 'text-emerald-400' : 'text-slate-300'}>
                        {cand.distanceKm} km
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-slate-300">
                      {cand.temp !== null && cand.temp !== undefined ? `${cand.temp}°C` : "—"}
                      {cand.pressure ? ` • ${cand.pressure} hPa` : ""}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3" />
                          Wybrana (Najbliższa)
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          +{Number((cand.distanceKm - (calculatedCandidates[0]?.distanceKm || 0)).toFixed(1))} km
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela / Karty 5 kluczowych parametrów */}
      <div className="space-y-4">
        {diagnosticsList.map((item) => {
          const isExpanded = expandedParam === item.paramName;
          return (
            <div 
              key={item.paramName}
              className="bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all"
            >
              <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                onClick={() => setExpandedParam(isExpanded ? null : item.paramName)}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                    {item.paramName.includes("moisture") ? (
                      <Droplet className="w-4 h-4 text-emerald-400" />
                    ) : item.paramName.includes("radiation") ? (
                      <Sun className="w-4 h-4 text-amber-400" />
                    ) : item.paramName.includes("pressure") ? (
                      <Gauge className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Thermometer className="w-4 h-4 text-indigo-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{item.label}</span>
                      <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 bg-white/5 rounded border border-white/5">
                        {item.paramName}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-indigo-300">
                      Pole API: {item.apiField}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 self-end md:self-auto">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Wartość w UI</div>
                    <div className="text-sm font-black text-emerald-400 font-mono">{item.uiComponentValue}</div>
                  </div>

                  <div className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Szczegółowy przebieg przetwarzania */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2 bg-black/30 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                      1. Otrzymano z API (Raw JSON)
                    </span>
                    <div className="font-mono text-slate-200">
                      <span className="text-slate-500">Wartość: </span>
                      <strong className="text-amber-300">{JSON.stringify(item.rawApiValue)}</strong>
                    </div>
                    <div className="font-mono text-slate-400 text-[11px]">
                      <span className="text-slate-500">Typ i jednostka: </span>
                      {item.rawApiType}
                    </div>
                  </div>

                  <div className="space-y-2 bg-black/30 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                      2. Przeliczenie i parser
                    </span>
                    <div className="font-mono text-slate-200">
                      <span className="text-slate-500">Wynik przeliczenia: </span>
                      <strong className="text-emerald-300">{String(item.calculatedValue)}</strong>
                    </div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      <span className="text-slate-500">Formuła: </span>
                      {item.calculationFormula}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-2 bg-black/30 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase text-indigo-300 block tracking-wider flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5" />
                      3. Miejsca w kodzie renderujące tę wartość
                    </span>
                    <ul className="space-y-1 text-[11px] font-mono text-slate-300">
                      {item.uiRenderLocations.map((loc, lIdx) => (
                        <li key={lIdx} className="flex items-start gap-2">
                          <span className="text-emerald-400">✓</span>
                          <span>{loc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ApiDataFlowDiagnosticsCard;
