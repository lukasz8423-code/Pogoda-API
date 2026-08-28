import React from "react";
import { Navigation } from "lucide-react";

interface WindCompassRoseProps {
  speed: number;
  gusts?: number;
  degrees: number;
  directionText: string;
}

export default function WindCompassRose({ speed, gusts, degrees, directionText }: WindCompassRoseProps) {
  // Normalize degrees 0-360
  const normalizedDegrees = ((degrees % 360) + 360) % 360;

  return (
    <div className="flex items-center space-x-3 w-full">
      {/* Compass Dial */}
      <div className="relative w-16 h-16 shrink-0 flex items-center justify-center bg-slate-900/80 rounded-full border border-teal-500/30 p-1 shadow-inner">
        {/* Outer Ring & Cardinal Points */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[8px] font-black text-slate-400">
          <span className="absolute top-0.5 text-teal-400">N</span>
          <span className="absolute right-1">E</span>
          <span className="absolute bottom-0.5">S</span>
          <span className="absolute left-1">W</span>
        </div>

        {/* Tick marks */}
        <div className="absolute inset-1 rounded-full border border-dashed border-slate-700/60 pointer-events-none" />

        {/* Direction Needle */}
        <div 
          className="relative w-10 h-10 flex items-center justify-center transition-transform duration-700 ease-out"
          style={{ transform: `rotate(${normalizedDegrees}deg)` }}
        >
          <Navigation className="w-7 h-7 text-teal-400 fill-teal-400/30 drop-shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
        </div>

        {/* Center dot */}
        <div className="absolute w-2 h-2 bg-teal-300 rounded-full border border-slate-900 z-10" />
      </div>

      {/* Wind Stats Details */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <div className="flex items-baseline space-x-1">
          <span className="text-xl font-bold text-white tracking-tight">{speed}</span>
          <span className="text-xs text-teal-300 font-semibold">km/h</span>
        </div>
        <p className="text-xs font-bold text-teal-400 truncate" title={directionText}>
          {directionText} ({degrees}°)
        </p>
        {gusts && gusts > speed ? (
          <span className="text-[10px] text-amber-300/90 font-medium truncate">
            ⚡ Porywy do <strong className="text-amber-200">{gusts} km/h</strong>
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">Wiatr stabilny</span>
        )}
      </div>
    </div>
  );
}
