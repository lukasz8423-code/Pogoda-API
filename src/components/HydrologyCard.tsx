import React from 'react';
import { Droplets, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { motion } from 'motion/react';

interface HydrologyCardProps {
  data: {
    stations: any[];
    source: string;
  } | null;
}

const HydrologyCard: React.FC<HydrologyCardProps> = ({ data }) => {
  if (!data || !data.stations || data.stations.length === 0) {
    return (
      <div className="bg-[#111c44]/60 border border-dashed border-white/10 rounded-[32px] p-6 backdrop-blur-xl text-center">
        <Droplets className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Brak lokalnych danych hydrologicznych</p>
      </div>
    );
  }

  // For now, show the first 3 stations as a sample of regional activity
  const displayStations = data.stations.slice(0, 4);

  return (
    <div className="[perspective:1500px]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ rotateY: 5, rotateX: 5, translateZ: 30, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        style={{ transformStyle: "preserve-3d" }}
        className="bg-[#111c44]/60 border border-white/20 rounded-[32px] p-6 backdrop-blur-xl relative overflow-hidden shadow-2xl group hover:border-blue-500/40"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
        
        <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-blue-500/30 rounded-2xl border border-blue-500/40 shadow-lg">
              <Droplets className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">Sytuacja Hydrologiczna (IMGW)</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter mt-1">Stany wód w regionie</p>
            </div>
          </div>

          <div className="space-y-3" style={{ transform: "translateZ(30px)" }}>
            {displayStations.map((station, idx) => (
              <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between hover:bg-white/10 transition-all">
                <div className="min-w-0 flex-1 mr-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-black text-white truncate uppercase tracking-tighter">{station.stacja}</span>
                    <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded-lg border border-white/10">
                      {station.rzeka}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Stan: <span className="text-white font-black">{station.stan_wody} cm</span></span>
                    {station.tendencja === 'rosnąca' && <ArrowUpRight className="w-4 h-4 text-red-400" />}
                    {station.tendencja === 'malejąca' && <ArrowDownRight className="w-4 h-4 text-emerald-400" />}
                    {station.tendencja === 'bez zmian' && <Minus className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>
                
                <div className="flex-shrink-0">
                  {parseInt(station.stan_wody) > 400 ? (
                    <div className="p-2 bg-red-500/30 rounded-xl border border-red-500/40 animate-pulse">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] border border-emerald-400/50" />
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[8px] text-slate-500 text-center font-black uppercase tracking-[0.3em]">
            Stacje IMGW-PIB Online
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default HydrologyCard;
