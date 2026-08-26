import React from "react";
import { ShieldAlert } from "lucide-react";

export function WeatherWarningsPlaceholder() {
  return (
    <div className="max-w-5xl mx-auto my-6 p-6 bg-emerald-500/[0.03] border border-emerald-500/20 rounded-3xl backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
      <div className="flex items-center space-x-4">
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/35 rounded-2xl text-emerald-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h4 className="text-base font-bold text-white mb-1">Ostrzeżenia Meteorologiczne IMGW</h4>
          <p className="text-xs text-slate-400 max-w-md">
            Brak aktywnych ostrzeżeń meteorologicznych i hydrologicznych dla tej lokalizacji. Warunki są stabilne.
          </p>
        </div>
      </div>
      <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-400/30 rounded-xl text-xs font-bold text-emerald-300 uppercase tracking-wider shrink-0">
        Brak zagrożeń
      </div>
    </div>
  );
}
