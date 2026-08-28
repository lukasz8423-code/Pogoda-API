import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cloud, Sun, Info, X, Layers, Eye } from "lucide-react";

interface CloudLayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelCloudCover: number | null;
  opticalCloudCover: number;
  opticalDescription: string;
  lowCloud: number;
  midCloud: number;
  highCloud: number;
}

export default function CloudLayersModal({
  isOpen,
  onClose,
  modelCloudCover,
  opticalCloudCover,
  opticalDescription,
  lowCloud,
  midCloud,
  highCloud
}: CloudLayersModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-gradient-to-b from-[#0e172e] to-[#080d1e] border border-white/15 rounded-3xl p-5 sm:p-6 shadow-2xl text-white overflow-hidden my-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-slate-300 hover:text-white transition-all cursor-pointer"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 shadow-inner">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Zachmurzenie i Warstwy Chmur
              </h2>
              <p className="text-xs text-indigo-200/80 font-medium">
                Analiza modelu numerycznego oraz wskaźnika OptiCloud
              </p>
            </div>
          </div>

          {/* Dual Overview Cards */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {/* Model Cloud Cover */}
            <div className="p-3.5 rounded-2xl bg-white/[0.05] border border-white/10 flex flex-col items-center text-center">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Modelowe
              </span>
              <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {modelCloudCover !== null ? `${modelCloudCover}%` : "—"}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 leading-tight">
                Całkowite pokrycie atmosfery (Open-Meteo)
              </span>
            </div>

            {/* Optical Cloud Cover (OptiCloud) */}
            <div className="p-3.5 rounded-2xl bg-indigo-500/15 border border-indigo-400/30 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 px-2 py-0.5 bg-indigo-500/30 text-[9px] font-black text-indigo-200 uppercase rounded-bl-lg">
                OptiCloud
              </div>
              <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wider mb-1">
                Optyczne
              </span>
              <span className="text-2xl sm:text-3xl font-black text-indigo-100 tracking-tight">
                {opticalCloudCover}%
              </span>
              <span className="text-[10.5px] text-indigo-300 font-semibold mt-1 leading-tight">
                {opticalDescription}
              </span>
            </div>
          </div>

          {/* Cloud Layers Breakdown */}
          <div className="space-y-3 mb-5">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              Pionowy rozkład warstw chmur
            </h3>

            {/* Niskie */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-200">
                  Niskie (0 – 2 000 m):
                </span>
                <span className="font-bold text-white text-sm">{lowCloud}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, lowCloud))}%` }} 
                />
              </div>
              <p className="text-[10.5px] text-slate-400">
                Gatunki: <span className="text-slate-300">Stratus, Stratocumulus, Cumulus</span> (wpływ 100% – całkowicie blokują słońce i rzucają cienie).
              </p>
            </div>

            {/* Średnie */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-200">
                  Średnie (2 000 – 6 000 m):
                </span>
                <span className="font-bold text-white text-sm">{midCloud}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, midCloud))}%` }} 
                />
              </div>
              <p className="text-[10.5px] text-slate-400">
                Gatunki: <span className="text-slate-300">Altocumulus, Altostratus</span> (wpływ 55% – efekt mlecznego nieba / matowej szyby).
              </p>
            </div>

            {/* Wysokie */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-200">
                  Wysokie (6 000 – 12 000 m):
                </span>
                <span className="font-bold text-white text-sm">{highCloud}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, highCloud))}%` }} 
                />
              </div>
              <p className="text-[10.5px] text-slate-400">
                Gatunki: <span className="text-slate-300">Cirrus, Cirrocumulus, Cirrostratus</span> (wpływ 15% – przezroczyste kryształki lodu, słońce nadal świeci).
              </p>
            </div>
          </div>

          {/* Autorska Notka Informacyjna */}
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 flex items-start gap-2.5 mb-5">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-200/90 leading-relaxed">
              <strong>OptiCloud</strong> – autorski wskaźnik Aury uwzględniający wpływ poszczególnych warstw chmur na odbiór zachmurzenia przez obserwatora na powierzchni Ziemi.
            </p>
          </div>

          {/* Close Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            Zamknij
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
