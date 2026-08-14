import { Loader2 } from "lucide-react";

interface WeatherSkeletonProps {
  statusMessage?: string;
}

export default function WeatherSkeleton({ statusMessage = "Uruchamianie..." }: WeatherSkeletonProps) {
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
    </div>
  );
}
