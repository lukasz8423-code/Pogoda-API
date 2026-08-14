import React from 'react';
import { CurrentWeather } from '../types';
import { Droplets, Gauge, Wind, Eye, CloudRain, Snowflake, Droplet } from 'lucide-react';

interface Props {
  current: CurrentWeather;
}

const AdditionalWeatherParameters: React.FC<Props> = ({ current }) => {
  const visKm = current.visibility ? Math.round(current.visibility / 1000) : 10;
  const snowVal = typeof current.snowfall === 'number' ? current.snowfall : 0;

  const parameters = [
    { label: 'Wilgotność', value: `${current.relative_humidity_2m ?? 0}%`, icon: Droplets },
    { label: 'Ciśnienie', value: `${current.pressure_msl ?? 1029} hPa`, icon: Gauge },
    { label: 'Wiatr', value: `${current.wind_speed_10m ?? 0} km/h`, icon: Wind },
    { label: 'Porywy', value: `${current.wind_gusts_10m || 0} km/h`, icon: Wind },
    { label: 'Widoczność', value: `${visKm} km`, icon: Eye },
    { label: 'Opady', value: `${current.precipitation ?? 0} mm`, icon: CloudRain },
    { label: 'Śnieg', value: `${snowVal} cm`, icon: Snowflake },
    { label: 'Wilgotność gleby', value: `${current.soil_moisture_satellite ?? 0}%`, icon: Droplet },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
      {parameters.map((param, index) => (
        <div key={index} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
          <param.icon className="w-5 h-5 text-blue-400 mb-2" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{param.label}</span>
          <span className="text-sm font-semibold text-white mt-1">{param.value}</span>
        </div>
      ))}
    </div>
  );
};

export default AdditionalWeatherParameters;
