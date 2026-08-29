import React from 'react';
import { Wind, Info, MapPin, Smartphone } from 'lucide-react';
import { motion } from 'motion/react';
import { Capacitor } from '@capacitor/core';

interface AirQualityCardProps {
  data: {
    stationName: string;
    address?: string;
    distanceKm: number;
    aqi: string;
    pm10?: string;
    pm25?: string;
    o3?: string;
    no2?: string;
    source: string;
  } | null;
}

const AirQualityCard: React.FC<AirQualityCardProps> = ({ data }) => {
  const isWeb = !Capacitor.isNativePlatform();

  if (!data) {
    return (
      <div className="bg-[#111c44]/60 border border-dashed border-white/10 rounded-[32px] p-6 backdrop-blur-xl text-center">
        <Wind className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
        <h3 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Jakość Powietrza (GIOŚ)</h3>
        <p className="text-[9px] text-slate-600 font-bold italic mb-4">Dane niedostępne w przeglądarce (CORS)</p>
        
        {isWeb && (
          <div className="flex items-center justify-center space-x-2 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <p className="text-[9px] text-indigo-300 font-black uppercase tracking-tight">Dostępne w aplikacji APK</p>
          </div>
        )}
      </div>
    );
  }

  const getAqiColor = (aqi: string) => {
    const a = aqi.toLowerCase();
    if (a.includes('bardzo dobry')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (a.includes('dobry')) return 'text-green-400 bg-green-500/10 border-green-500/20';
    if (a.includes('umiarkowany')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    if (a.includes('dostateczny')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (a.includes('zły')) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (a.includes('bardzo zły')) return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  return (
    <div className="[perspective:1500px]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ rotateY: -5, rotateX: 5, translateZ: 30, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
        className="bg-[#111c44]/60 border border-white/20 rounded-[32px] p-6 backdrop-blur-xl relative overflow-hidden shadow-2xl group hover:border-indigo-500/40"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-cyan-500/30 rounded-2xl border border-cyan-500/40 shadow-lg">
                <Wind className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">Jakość Powietrza (GIOŚ)</h3>
                <div className="flex items-center space-x-1 mt-1">
                  <MapPin className="w-3 h-3 text-indigo-400" />
                  <p className="text-[10px] text-slate-400 font-black truncate max-w-[150px] uppercase">
                    {data.stationName}
                  </p>
                </div>
              </div>
            </div>
            <div className={`px-4 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-tighter shadow-lg ${getAqiColor(data.aqi)}`}>
              {data.aqi}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6" style={{ transform: "translateZ(30px)" }}>
            {data.pm25 && (
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">PM2.5</p>
                <p className="text-sm font-black text-white">{data.pm25} µg/m³</p>
              </div>
            )}
            {data.pm10 && (
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">PM10</p>
                <p className="text-sm font-black text-white">{data.pm10} µg/m³</p>
              </div>
            )}
          </div>

          <div className="flex items-start space-x-3 p-4 bg-indigo-500/5 rounded-2xl border border-dashed border-indigo-500/20" style={{ transform: "translateZ(10px)" }}>
            <Info className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 leading-relaxed font-bold italic">
              Oficjalna telemetria GIOŚ. Parametry pyłów zawieszonych podawane w czasie rzeczywistym.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AirQualityCard;
