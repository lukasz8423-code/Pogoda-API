import { motion, AnimatePresence } from "motion/react";
import { X, GitMerge, Radio, Cloud, Gauge, Sparkles, ShieldCheck, CheckCircle2 } from "lucide-react";

interface DataFusionEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  fusionData: {
    stationName: string;
    stationDistance: string;
    rawModelTemp: number | null;
    stationTemp: number | null | undefined;
    fusedTemp: number | null;
    rawModelHumidity: number | null;
    stationHumidity: number | null | undefined;
    fusedHumidity: number | null;
    rawModelWind: number | null;
    stationWind: number | null | undefined;
    fusedWind: number | null;
    stationPressure: number | null;
    phonePressure: number | null;
    fusedPressure: number | null;
    satelliteCloudCover: number | null;
    sensorLux: number | null;
    fusedCloudCover: number | null;
    isLuxClamped: boolean;
    fusionMetadata?: {
      cloud_disagreement: number;
      applied_filters: string[];
      confidence_score: number;
    };
  };
}

export default function DataFusionEngineModal({ isOpen, onClose, fusionData }: DataFusionEngineModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative overflow-hidden text-slate-100 max-h-[90vh] overflow-y-auto"
        >
          {/* Top Glow Header */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 rounded-2xl">
              <GitMerge className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Inteligentny Agregator Danych
              </span>
              <h3 className="text-xl font-bold text-white">Silnik Fuzji Danych</h3>
            </div>
            {fusionData.fusionMetadata && typeof fusionData.fusionMetadata.confidence_score === 'number' && (
              <div className="text-right">
                <div className={`text-lg font-black ${fusionData.fusionMetadata.confidence_score > 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {Math.round(fusionData.fusionMetadata.confidence_score)}%
                </div>
                <div className="text-[8px] uppercase tracking-tighter text-slate-500 font-bold">WIARYGODNOŚĆ</div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-300 mb-5 leading-relaxed bg-indigo-500/10 border border-indigo-500/20 p-3.5 rounded-2xl">
            Aplikacja syntezuje w czasie rzeczywistym odczyty z najbliższej stacji telemetrycznej IMGW, czujników smartfona, danych satelitarnych, monitoringu jakości powietrza GIOŚ oraz polskiej sieci radarowej POLRAD.
          </p>

          <div className="space-y-4">
            {/* Polish Public Data Source Indicator */}
            <div className="flex items-center space-x-2 px-1 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Autoryzowane Źródła Publiczne (PL)</span>
            </div>
            {/* 1. Stacja IMGW + Model */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200">1. Priorytetyzacja IMGW (90% Weight)</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Telemetria 2.5 km
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Lokalizacja: <strong className="text-slate-200">{fusionData.stationName}</strong>
              </p>
              
              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Temperatura</span>
                  <span className="font-bold text-emerald-400">{fusionData.fusedTemp}°C</span>
                  <span className="text-[9px] text-slate-500 block">(90% Stacja {fusionData.stationTemp}°C / 10% Model {fusionData.rawModelTemp}°C)</span>
                </div>
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Wilgotność</span>
                  <span className="font-bold text-cyan-400">{fusionData.fusedHumidity}%</span>
                  <span className="text-[9px] text-slate-500 block">(Stacja {fusionData.stationHumidity}% vs Model {fusionData.rawModelHumidity}%)</span>
                </div>
                <div className="bg-white/5 p-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block">Wiatr</span>
                  <span className="font-bold text-indigo-400">{fusionData.fusedWind} km/h</span>
                  <span className="text-[9px] text-slate-500 block">(Stacja {fusionData.stationWind} vs Model {fusionData.rawModelWind})</span>
                </div>
              </div>
            </div>

            {/* 2. Hybrydowe Ciśnienie */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-200">2. Hybrydowe Ciśnienie Atmosferyczne</span>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  Barometr + IMGW
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Łączy mikrozmiany z czujnika fizycznego telefonu z oficjalnym punktem odniesienia stacji IMGW.
              </p>
              <div className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl text-xs border border-white/5">
                <span className="text-slate-300">Skorygowane ciśnienie:</span>
                <span className="font-bold text-amber-300 text-sm">{fusionData.fusedPressure} hPa</span>
              </div>
            </div>

            {/* 3. Smart Zachmurzenie */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cloud className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-slate-200">3. Smart Zachmurzenie (Korekta Olśnień)</span>
                </div>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                  Fotometr + Satelita
                </span>
              </div>
              
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Łączy dane z 5 modeli globalnych (ECMWF, ICON, GFS) z odczytem lokalnego fotometru i UV Indexu.
                </p>
                
                {fusionData.fusionMetadata && fusionData.fusionMetadata.applied_filters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {fusionData.fusionMetadata.applied_filters.map(filter => (
                      <div key={filter} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-[8px] font-bold text-emerald-300 uppercase tracking-tighter">{filter.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl text-xs border border-white/5">
                <div className="flex flex-col">
                  <span className="text-slate-300">Ostateczne zachmurzenie:</span>
                  <span className="text-[9px] text-slate-500">Błąd zgodności: {fusionData.fusionMetadata?.cloud_disagreement.toFixed(1)}%</span>
                </div>
                <span className="font-bold text-blue-300 text-sm">
                  {fusionData.fusedCloudCover}% 
                  {fusionData.isLuxClamped && <span className="text-[10px] text-purple-300 ml-1 font-normal">(Wygładzanie słońca)</span>}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl transition-all shadow-lg active:scale-95"
          >
            Zamknij podgląd fuzji
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
