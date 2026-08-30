import React from "react";
import { CloudRain, AlertTriangle, CheckCircle2, Clock, Droplets } from "lucide-react";
import { HourlyForecast } from "../types";

interface NowcastPrecipitationAlertProps {
  hourly: HourlyForecast;
  startIndex?: number;
}

export default function NowcastPrecipitationAlert({ hourly, startIndex = 0 }: NowcastPrecipitationAlertProps) {
  if (!hourly || !hourly.time || hourly.time.length === 0) return null;

  // Take next 6 hours from current index
  const nextHours = Array.from({ length: 6 }).map((_, i) => {
    const idx = Math.min(startIndex + i, hourly.time.length - 1);
    const timeStr = hourly.time[idx];
    const dateObj = new Date(timeStr);
    const hourLabel = isNaN(dateObj.getTime()) ? `${i}h` : `${dateObj.getHours()}:00`;
    const pop = hourly.precipitation_probability?.[idx] ?? 0;
    const precip = hourly.precipitation?.[idx] ?? 0;
    return {
      index: i,
      timeLabel: hourLabel,
      pop,
      precip,
      rawTime: timeStr
    };
  });

  const currentPrecip = nextHours[0]?.precip ?? 0;
  const currentPop = nextHours[0]?.pop ?? 0;

  // Determine Nowcast Status & Verdict
  let headlineVerdict = "";
  let subText = "";
  let statusBg = "";
  let borderClass = "";
  let iconComponent = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;

  const firstRainHour = nextHours.find((h, i) => i > 0 && (h.precip > 0.1 || h.pop >= 40));

  const rainAbsoluteIndex = firstRainHour ? startIndex + firstRainHour.index : null;
  console.log("[NOWCAST DEBUG]", {
    now: new Date().toISOString(),
    startIndex,
    currentTime: hourly.time[startIndex] ?? null,
    firstTimes: hourly.time.slice(0, 8),
    rainIndex: rainAbsoluteIndex,
    rainTime: rainAbsoluteIndex !== null ? (hourly.time[rainAbsoluteIndex] ?? null) : null,
    rain: rainAbsoluteIndex !== null ? (hourly.precipitation?.[rainAbsoluteIndex] ?? null) : null,
    pop: rainAbsoluteIndex !== null ? (hourly.precipitation_probability?.[rainAbsoluteIndex] ?? null) : null
  });

  if (currentPrecip > 0.2 || currentPop >= 70) {
    headlineVerdict = `Trwa opad deszczu (ok. ${currentPrecip.toFixed(1)} mm/h)`;
    const dryHour = nextHours.find((h, i) => i > 0 && h.precip < 0.1 && h.pop < 30);
    if (dryHour) {
      subText = `Przewidywane ustanie opadów za około ${dryHour.index * 60 - 15}–${dryHour.index * 60} minut (${dryHour.timeLabel}).`;
    } else {
      subText = `Opad utrzyma się przez najbliższe 2–3 godziny. Zalecany parasol.`;
    }
    statusBg = "bg-blue-950/40";
    borderClass = "border-cyan-500/40";
    iconComponent = <CloudRain className="w-5 h-5 text-cyan-400 shrink-0 animate-bounce" />;
  } else if (firstRainHour) {
    const minutesToRain = firstRainHour.index * 60 - 20;
    headlineVerdict = `Uwaga, za ok. ${minutesToRain > 0 ? minutesToRain : 20} min możliwe opady!`;
    subText = `Prawdopodobieństwo deszczu wzrośnie do ${firstRainHour.pop}% o godz. ${firstRainHour.timeLabel} (${firstRainHour.precip > 0 ? firstRainHour.precip.toFixed(1) + ' mm/h' : 'przelotna mżawka'}).`;
    statusBg = "bg-amber-950/40";
    borderClass = "border-amber-500/40";
    iconComponent = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />;
  } else {
    headlineVerdict = "Brak opadów przez najbliższe 2-3h";
    subText = "Pogoda stabilna, niebo bez ryzyka opadów deszczu w najbliższych godzinach.";
    statusBg = "bg-emerald-950/30";
    borderClass = "border-emerald-500/30";
    iconComponent = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
  }

  return (
    <div className={`w-full p-4 rounded-3xl border backdrop-blur-md transition-all shadow-xl ${statusBg} ${borderClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-white/10 rounded-2xl border border-white/15">
            <Droplets className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-cyan-300 uppercase">Radar Opadowy &bull; Nowcast</span>
            <h3 className="text-sm font-extrabold text-white">Alert Opadowy</h3>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-[11px] text-slate-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
          <Clock className="w-3 h-3 text-cyan-400" />
          <span>Co minuty</span>
        </div>
      </div>

      {/* Main Verdict Box */}
      <div className="p-3 bg-black/25 rounded-2xl border border-white/10 flex items-start space-x-3 mb-3">
        {iconComponent}
        <div>
          <h4 className="text-xs font-bold text-slate-100">{headlineVerdict}</h4>
          <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{subText}</p>
        </div>
      </div>

      {/* Timeline Minute/Hour Grid */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-slate-400 font-medium px-1">
          <span>Oś czasu opadów:</span>
          <span>Najbliższe 6 godzin</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {nextHours.map((h, idx) => {
            let barBg = "bg-emerald-500/30 border-emerald-500/40 text-emerald-200";
            let intensityText = "Brak";
            if (h.precip > 1.5 || h.pop >= 75) {
              barBg = "bg-blue-600/60 border-blue-400 text-white font-bold";
              intensityText = `${h.precip > 0 ? h.precip.toFixed(1) : h.pop + '%'}`;
            } else if (h.precip > 0.1 || h.pop >= 35) {
              barBg = "bg-amber-500/50 border-amber-400 text-amber-100";
              intensityText = `${h.pop}%`;
            }

            return (
              <div 
                key={idx}
                className={`p-1.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${barBg}`}
              >
                <span className="text-[9px] text-slate-300 font-mono">{idx === 0 ? "Teraz" : h.timeLabel}</span>
                <span className="text-[10px] my-1 font-bold">{intensityText}</span>
                <div className="w-full bg-black/30 rounded-full h-1 overflow-hidden">
                  <div 
                    className="bg-cyan-300 h-full transition-all"
                    style={{ width: `${Math.max(5, Math.min(100, h.pop))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
