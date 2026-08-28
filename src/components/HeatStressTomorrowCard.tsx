import React from "react";
import { Flame, Sun, ShieldAlert, Heart, Clock } from "lucide-react";
import { HourlyForecast, DailyForecast, WeatherResponse } from "../types";

interface HeatStressTomorrowCardProps {
  hourly?: HourlyForecast;
  daily?: DailyForecast;
  data?: WeatherResponse;
  startIndex?: number;
}

export default function HeatStressTomorrowCard({ 
  hourly: hourlyProp, 
  daily: dailyProp, 
  data,
  startIndex = 0 
}: HeatStressTomorrowCardProps) {
  const hourly = hourlyProp || data?.weather?.hourly;
  const daily = dailyProp || data?.weather?.daily;

  if (!hourly || !hourly.time || hourly.time.length < 24) return null;

  // Identify tomorrow's hours: usually index (startIndex + 24) up to (startIndex + 47)
  const tomorrowStartIndex = Math.min(startIndex + 24, Math.max(0, hourly.time.length - 24));
  const tomorrowHours = Array.from({ length: 24 }).map((_, i) => {
    const idx = Math.min(tomorrowStartIndex + i, hourly.time.length - 1);
    const timeStr = hourly.time[idx];
    const dateObj = new Date(timeStr);
    const hourNum = isNaN(dateObj.getTime()) ? i : dateObj.getHours();
    const temp = hourly.temperature_2m?.[idx] ?? 20;
    const apparent = hourly.apparent_temperature?.[idx] ?? temp;
    const uv = hourly.uv_index?.[idx] ?? 0;
    return {
      hourNum,
      timeLabel: `${hourNum}:00`,
      temp,
      apparent,
      uv,
      isHeatPeak: apparent >= 28 || uv >= 6,
    };
  });

  // Calculate statistics for tomorrow
  const maxApparent = Math.round(Math.max(...tomorrowHours.map((h) => h.apparent)));
  const maxTemp = Math.round(Math.max(...tomorrowHours.map((h) => h.temp)));
  const maxUv = Math.round(Math.max(...tomorrowHours.map((h) => h.uv)) * 10) / 10;

  // Find peak stress timeframe (e.g. 11:00 to 16:00)
  const peakHours = tomorrowHours.filter((h) => h.apparent >= 26 || h.uv >= 5);
  let peakTimeframeText = "";
  if (peakHours.length > 0) {
    const startHour = peakHours[0].hourNum;
    const endHour = peakHours[peakHours.length - 1].hourNum + 1;
    peakTimeframeText = `Od godz. ${startHour}:00 do ${endHour}:00`;
  } else {
    peakTimeframeText = "Brak krytycznych godzin";
  }

  // Determine Verdict Headline & Severity
  let verdictTitle = "";
  let verdictDescription = "";
  let alertBadge = "";
  let badgeStyle = "";
  let iconComponent = <Sun className="w-5 h-5 text-amber-400 shrink-0" />;

  if (maxUv >= 8 || maxApparent >= 33) {
    verdictTitle = `${peakTimeframeText}: Ekstremalne słońce i upał!`;
    verdictDescription = `Temp. odczuwalna do ${maxApparent}°C z indeksem UV ${maxUv}. Wysokie ryzyko udaru słonecznego i odwodnienia. Zalecane unikanie słońca w południe.`;
    alertBadge = "EKSTREMALNY STRES CIEPLNY";
    badgeStyle = "bg-rose-500/20 text-rose-300 border-rose-500/40";
    iconComponent = <Flame className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />;
  } else if (maxUv >= 6 || maxApparent >= 28) {
    verdictTitle = `${peakTimeframeText}: Podwyższone obciążenie cieplne`;
    verdictDescription = `Indeks UV wyniesie do ${maxUv}, a temp. odczuwalna do ${maxApparent}°C. Pamiętaj o kremie z filtrem UV oraz regularnym piciu wody.`;
    alertBadge = "OSTRZEŻENIE UV & UPAŁ";
    badgeStyle = "bg-amber-500/20 text-amber-300 border-amber-500/40";
    iconComponent = <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />;
  } else {
    verdictTitle = "Łagodne i bezpieczne warunki na jutro";
    verdictDescription = `Jutrzejsza temperatura odczuwalna osiągnie max ${maxApparent}°C przy umiarkowanym UV (${maxUv}). Brak zagrożenia udarem cieplnym.`;
    alertBadge = "WARUNKI BEZPIECZNE";
    badgeStyle = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    iconComponent = <Heart className="w-5 h-5 text-emerald-400 shrink-0" />;
  }

  return (
    <div className="w-full p-4 rounded-3xl bg-slate-900/60 border border-orange-500/30 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-orange-500/20 rounded-2xl border border-orange-500/30">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-orange-300 uppercase">Prognoza Bio-Meteo &bull; Jutro</span>
            <h3 className="text-sm font-extrabold text-white">Stres Cieplny & UV na Jutro</h3>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
          {alertBadge}
        </span>
      </div>

      {/* Main Verdict Summary Box */}
      <div className="p-3 bg-black/30 rounded-2xl border border-white/10 flex items-start space-x-3 mb-3">
        {iconComponent}
        <div>
          <h4 className="text-xs font-bold text-orange-200">{verdictTitle}</h4>
          <p className="text-[11px] text-slate-300 mt-1 leading-snug">{verdictDescription}</p>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">Max Temp. Odczuwalna</span>
          <span className="text-sm font-extrabold text-white">{maxApparent}°C</span>
          <span className="text-[9px] text-orange-300 block font-mono">Realna {maxTemp}°C</span>
        </div>

        <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">Szczyt Indeksu UV</span>
          <span className="text-sm font-extrabold text-amber-300">{maxUv} / 12</span>
          <span className="text-[9px] text-amber-400 block font-mono">
            {maxUv >= 8 ? "Ekstremalny" : maxUv >= 6 ? "Wysoki" : "Umiarkowany"}
          </span>
        </div>

        <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">Godziny Szczytu</span>
          <div className="flex items-center justify-center space-x-1 text-xs font-bold text-cyan-300 mt-0.5">
            <Clock className="w-3 h-3" />
            <span>{peakHours.length > 0 ? `${peakHours[0].hourNum}:00` : "Brak"}</span>
          </div>
          <span className="text-[9px] text-slate-400 block font-mono">Szczyt nasłonecznienia</span>
        </div>
      </div>

      {/* Daytime Hourly Visual Strip for Tomorrow (08:00 - 20:00) */}
      <div className="space-y-1">
        <span className="text-[10px] text-slate-400 font-medium px-1">Profil temperatury odczuwalnej i UV jutro (08:00 - 20:00):</span>
        <div className="grid grid-cols-7 gap-1">
          {tomorrowHours.slice(8, 21).filter((_, i) => i % 2 === 0).map((h, idx) => (
            <div 
              key={idx}
              className={`p-1.5 rounded-xl border flex flex-col items-center justify-between text-center ${
                h.isHeatPeak 
                  ? "bg-orange-500/30 border-orange-400/50 text-orange-100" 
                  : "bg-white/5 border-white/10 text-slate-300"
              }`}
            >
              <span className="text-[9px] font-mono text-slate-300">{h.timeLabel}</span>
              <span className="text-[10px] font-bold my-0.5">{Math.round(h.apparent)}°C</span>
              <span className="text-[8px] text-amber-300 font-bold">UV {h.uv.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
