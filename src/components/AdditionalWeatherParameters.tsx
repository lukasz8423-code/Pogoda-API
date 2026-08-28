import React from 'react';
import { CurrentWeather } from '../types';
import { Droplets, Gauge, Wind, Eye, CloudRain, Sun, Droplet, Activity } from 'lucide-react';
import { calculateLeafWetness } from '../utils/weatherUtils';

interface Props {
  current: CurrentWeather;
}

const AdditionalWeatherParameters: React.FC<Props> = ({ current }) => {
  if (!current) return null;

  const visKm = current.visibility ? Math.round(current.visibility / 1000) : 10;
  const pressureVal = Math.round(current.pressure_msl ?? 1013);
  const soilMoistureVal = typeof current.soil_moisture_satellite === 'number' 
    ? `${current.soil_moisture_satellite}%` 
    : 'Brak danych';
  const solarRadVal = typeof current.shortwave_radiation === 'number' 
    ? `${Math.round(current.shortwave_radiation)} W/m²` 
    : (current.is_day === 0 ? '0 W/m² (Noc)' : 'Brak danych');

  const weatherCode = (current as any).weather_code ?? (current as any).weathercode ?? (current as any).weatherCode ?? 0;

  const leafWetness = calculateLeafWetness(
    current.precipitation ?? 0,
    current.relative_humidity_2m ?? 50,
    current.temperature_2m ?? 15,
    undefined,
    current.is_day ?? 1,
    current.wind_speed_10m ?? 10,
    undefined,
    weatherCode
  );

  const parameters = [
    { label: 'Wilgotność', value: `${current.relative_humidity_2m ?? 0}%`, icon: Droplets, source: 'Pomiar / Model', desc: 'Wilgotność względna powietrza' },
    { label: 'Ciśnienie', value: `${pressureVal} hPa`, icon: Gauge, source: 'Barometr / Model', desc: 'Zredukowane ciśnienie atmosferyczne' },
    { label: 'Wiatr', value: `${current.wind_speed_10m ?? 0} km/h`, icon: Wind, source: 'Wiatromierz', desc: 'Średnia prędkość wiatru na 10m' },
    { label: 'Porywy', value: `${current.wind_gusts_10m || 0} km/h`, icon: Wind, source: 'Porywy wiatru', desc: 'Maksymalne porywy wiatru' },
    { label: 'Zwilżenie liścia', value: leafWetness.formatted, icon: Activity, source: 'Model Agro LWD', desc: 'Poziom zwilżenia blaszki liściowej (0-15)' },
    { label: 'Widoczność', value: `${visKm} km`, icon: Eye, source: 'Widzialność', desc: 'Przejrzystość powietrza' },
    { label: 'Opady', value: `${current.precipitation ?? 0} mm`, icon: CloudRain, source: 'Deszczomierz', desc: 'Suma opadów w bieżącej godzinie' },
    { label: 'Promieniowanie', value: solarRadVal, icon: Sun, source: 'Model radiacyjny (Siatka 10km)', desc: 'Średnie promieniowanie słoneczne w siatce modelu. Przypadki lokalnych przejaśnień i bezpośredniego słońca chwilowo odbiegają od średniej obszarowej.' },
    { label: 'Wilgotność gleby', value: soilMoistureVal, icon: Droplet, source: 'Sentinel / Model', desc: 'Wilgotność powierzchniowej warstwy gleby 0-3cm' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
      {parameters.map((param, index) => (
        <div key={index} title={param.desc} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center hover:bg-white/10 transition-colors cursor-help">
          <param.icon className="w-4 h-4 text-blue-400 mb-1.5" />
          <span className="text-[10px] text-slate-200 uppercase tracking-wider font-bold">{param.label}</span>
          <span className="text-sm font-semibold text-white mt-0.5">{param.value}</span>
          <span className="text-[9px] text-slate-300 font-mono mt-1">{param.source}</span>
        </div>
      ))}
    </div>
  );
};

export default AdditionalWeatherParameters;

