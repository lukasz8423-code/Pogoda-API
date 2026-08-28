import { useState, useEffect } from "react";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";

interface WeatherSkeletonProps {
  statusMessage?: string;
  onCancel?: () => void;
}

export default function WeatherSkeleton({ statusMessage = "Uruchamianie...", onCancel }: WeatherSkeletonProps) {
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowCancel(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950 p-6 space-y-6">
      <div className="flex justify-between items-center h-12">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl animate-pulse"></div>
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-full shadow-inner">
          <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
          <span className="text-xs font-medium text-slate-300">{statusMessage}</span>
        </div>
        <div className="w-12 h-12 bg-slate-900 rounded-2xl animate-pulse"></div>
      </div>
      
      <div className="flex flex-col items-center py-8 space-y-4">
        <div className="w-32 h-32 bg-slate-900 rounded-full animate-pulse"></div>
        <div className="w-48 h-12 bg-slate-900 rounded-full animate-pulse"></div>
        <div className="w-32 h-6 bg-slate-900 rounded-full animate-pulse"></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-900 rounded-3xl animate-pulse"></div>
        ))}
      </div>

      {showCancel && onCancel && (
        <div className="mt-auto pt-4 flex flex-col items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all shadow-lg active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
            <span>Wybierz miejscowość ręcznie</span>
          </button>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("aura_last_weather");
                localStorage.removeItem("aura_last_sync_time");
                localStorage.removeItem("aura_last_method");
              } catch(e) {}
              window.location.reload();
            }}
            className="text-[11px] text-slate-500 hover:text-slate-400 underline"
          >
            Zresetuj aplikację
          </button>
        </div>
      )}
    </div>
  );
}

