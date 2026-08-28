import React from "react";
import { motion } from "motion/react";
import { 
  Sparkles, 
  Wind, 
  CloudRain, 
  Sun, 
  Flame, 
  Shirt, 
  Clock, 
  SunMedium, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  ShieldAlert,
  ThermometerSun,
  Car,
  Dog,
  Footprints,
  Glasses
} from "lucide-react";
import { WeatherResponse } from "../types";
import { 
  getSmartWeatherTrendAlert, 
  getSmartClothingAdvice,
  getDriverRoadConditions,
  getBestWalkTimeWindow,
  SmartWeatherTrendAlert,
  SmartClothingAdvice,
  DriverRoadAlert,
  BestWalkWindow
} from "../utils/weatherUtils";

interface SmartWeatherAssistantCardProps {
  data: WeatherResponse;
  currentTemp?: number | null;
  currentApparentTemp?: number | null;
  currentWindSpeed?: number | null;
  currentWindGusts?: number | null;
  currentPrecipitation?: number | null;
  currentCloudCover?: number | null;
  currentShortwaveRadiation?: number | null;
  isDay?: boolean | number;
}

export default function SmartWeatherAssistantCard({
  data,
  currentTemp: propTemp,
  currentApparentTemp: propApparentTemp,
  currentWindSpeed: propWindSpeed,
  currentWindGusts: propWindGusts,
  currentPrecipitation: propPrecip,
  currentCloudCover: propCloud,
  currentShortwaveRadiation: propRad,
  isDay: propIsDay
}: SmartWeatherAssistantCardProps) {
  const current = data?.weather?.current || (data as any)?.current || {};
  const hourly = data?.weather?.hourly || (data as any)?.hourly || {};
  const daily = data?.weather?.daily || (data as any)?.daily || {};

  // Resolve current index in hourly data
  let currentIdx = 0;
  try {
    const nowIso = new Date().toISOString();
    const curHourPrefix = nowIso.slice(0, 13);
    if (Array.isArray(hourly?.time)) {
      const idx = hourly.time.findIndex((t: string) => t && t.startsWith(curHourPrefix));
      if (idx !== -1) currentIdx = idx;
    }
  } catch (e) {
    currentIdx = 0;
  }

  const effectiveTemp = typeof propTemp === 'number' 
    ? propTemp 
    : (typeof current?.temperature_2m === 'number' ? current.temperature_2m : (hourly?.temperature_2m?.[currentIdx] ?? 15));

  const effectiveApparentTemp = typeof propApparentTemp === 'number'
    ? propApparentTemp
    : (typeof current?.apparent_temperature === 'number' ? current.apparent_temperature : (hourly?.apparent_temperature?.[currentIdx] ?? effectiveTemp));

  const effectiveWindSpeed = typeof propWindSpeed === 'number'
    ? propWindSpeed
    : (typeof current?.wind_speed_10m === 'number' ? current.wind_speed_10m : (hourly?.wind_speed_10m?.[currentIdx] ?? 10));

  const effectiveWindGusts = typeof propWindGusts === 'number'
    ? propWindGusts
    : (typeof current?.wind_gusts_10m === 'number' ? current.wind_gusts_10m : (hourly?.wind_gusts_10m?.[currentIdx] ?? Math.round(effectiveWindSpeed * 1.3)));

  const effectivePrecip = typeof propPrecip === 'number'
    ? propPrecip
    : (typeof current?.precipitation === 'number' ? current.precipitation : (hourly?.precipitation?.[currentIdx] ?? 0));

  const effectiveCloud = typeof propCloud === 'number'
    ? propCloud
    : (typeof current?.cloud_cover === 'number' ? current.cloud_cover : (hourly?.cloud_cover?.[currentIdx] ?? 40));

  const effectiveRad = typeof propRad === 'number'
    ? propRad
    : (typeof current?.shortwave_radiation === 'number' ? current.shortwave_radiation : (hourly?.shortwave_radiation?.[currentIdx] ?? 0));

  const effectiveIsDay = typeof propIsDay === 'boolean'
    ? (propIsDay ? 1 : 0)
    : (typeof propIsDay === 'number' ? propIsDay : (current?.is_day ?? 1));

  // 1. Calculate 12-hour Trend Alert
  const trendAlert: SmartWeatherTrendAlert = getSmartWeatherTrendAlert(
    current,
    hourly,
    currentIdx,
    effectiveWindSpeed,
    effectiveWindGusts,
    effectivePrecip
  );

  // 2. Calculate Clothing Advice & Solar Advantage
  const clothingAdvice: SmartClothingAdvice = getSmartClothingAdvice(
    effectiveApparentTemp,
    effectiveTemp,
    effectiveRad,
    effectiveCloud,
    effectiveWindSpeed,
    effectiveWindGusts,
    effectivePrecip,
    effectiveIsDay
  );

  // 3. Calculate Driver Road Conditions
  const driverAlert: DriverRoadAlert = getDriverRoadConditions(
    current,
    hourly,
    daily,
    currentIdx,
    effectiveWindSpeed,
    effectiveWindGusts,
    effectivePrecip,
    effectiveTemp,
    effectiveCloud,
    effectiveIsDay
  );

  // 4. Calculate Best Walk Window (Spacer z psem / aktywność)
  const walkWindow: BestWalkWindow = getBestWalkTimeWindow(
    current,
    hourly,
    currentIdx,
    effectiveWindSpeed,
    effectiveWindGusts,
    effectivePrecip,
    effectiveTemp
  );

  // Render Icon for Trend Alert
  const renderTrendIcon = () => {
    switch (trendAlert.iconType) {
      case "wind":
        return <Wind className="w-5 h-5 text-teal-300 animate-pulse" />;
      case "rain":
        return <CloudRain className="w-5 h-5 text-cyan-300 animate-bounce" />;
      case "sun":
        return <Sun className="w-5 h-5 text-amber-300" />;
      case "heat":
        return <Flame className="w-5 h-5 text-rose-400 animate-pulse" />;
      case "sparkles":
      default:
        return <Sparkles className="w-5 h-5 text-emerald-300" />;
    }
  };

  // Badge Styles for Trend Alert
  const getBadgeStyle = (severity: string) => {
    switch (severity) {
      case "alert":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      case "warning":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "info":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
      case "success":
      default:
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    }
  };

  // Render Driver Icon
  const renderDriverIcon = () => {
    switch (driverAlert.iconType) {
      case "wind":
        return <Wind className="w-5 h-5 text-amber-300 animate-pulse" />;
      case "rain":
        return <CloudRain className="w-5 h-5 text-cyan-300" />;
      case "sun":
        return <Glasses className="w-5 h-5 text-amber-300" />;
      case "ice":
        return <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />;
      case "check":
      case "car":
      default:
        return <Car className="w-5 h-5 text-emerald-300" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-white/[0.09] to-white/[0.03] border border-white/12 hover:border-cyan-400/30 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl transition-all text-left"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 mb-4 border-b border-white/10">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/30 shadow-inner">
            <Sparkles className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300/90 block">
              Silnik Analityczny &bull; Profil 12H
            </span>
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
              Życiowy Asystent Pogodowy
            </h3>
          </div>
        </div>

        {clothingAdvice.hasSolarAdvantage ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold shadow-sm backdrop-blur-md">
            <SunMedium className="w-3.5 h-3.5 text-amber-400" />
            <span>Solar Advantage (+{Math.round(clothingAdvice.solarBonus)}°C)</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Na bieżąco</span>
          </div>
        )}
      </div>

      {/* Grid: 2 Col on desktop, Stack on mobile (4 moduly) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* ========================================================================= */}
        {/* SEKCJA 1: 🌬️ INTELIGENTNE OSTRZEŻENIE (Smart Weather Trend Alert)       */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between p-4 rounded-2xl bg-black/25 border border-white/8 hover:border-white/15 transition-all">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-white/5 border border-white/10">
                  {renderTrendIcon()}
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Inteligentne Ostrzeżenie
                </span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wider ${getBadgeStyle(trendAlert.severity)}`}>
                {trendAlert.badge}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white mb-1">
              {trendAlert.title}
            </h4>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {trendAlert.message}
            </p>
          </div>

          {trendAlert.highlightTime && (
            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Przewidywana zmiana warunków: <strong className="text-white">~{trendAlert.highlightTime}</strong></span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SEKCJA 2: 👕 RADA WS. UBIORU & REALNE ODCZUCIE SŁONECZNE                  */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between p-4 rounded-2xl bg-black/25 border border-white/8 hover:border-white/15 transition-all">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-400/25">
                  <Shirt className="w-5 h-5 text-amber-300" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Rada ws. Ubioru
                </span>
              </div>

              {clothingAdvice.hasSolarAdvantage ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40">
                  W słońcu: ~{Math.round(clothingAdvice.solarFeltTemp)}°C
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-200 border border-white/10">
                  Odczuwalna: {Math.round(clothingAdvice.apparentTemp)}°C
                </span>
              )}
            </div>

            <h4 className="text-sm font-bold text-white mb-1">
              {clothingAdvice.outfitTitle}
            </h4>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {clothingAdvice.outfitRecommendation}
            </p>
          </div>

          {/* Rekomendowane warstwy ubioru (chips) */}
          {clothingAdvice.clothingLayers.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center gap-1.5">
              {clothingAdvice.clothingLayers.map((layer, idx) => (
                <span 
                  key={idx}
                  className="px-2.5 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-medium text-slate-300"
                >
                  {layer}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SEKCJA 3: 🚗 DLA KIEROWCY (Warunki na drodze)                            */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between p-4 rounded-2xl bg-black/25 border border-white/8 hover:border-white/15 transition-all">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-blue-500/15 border border-blue-400/25">
                  {renderDriverIcon()}
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Dla Kierowcy
                </span>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wider ${getBadgeStyle(driverAlert.severity)}`}>
                {driverAlert.badge}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white mb-1">
              {driverAlert.title}
            </h4>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {driverAlert.message}
            </p>
          </div>

          {driverAlert.highlight && (
            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-amber-300/90 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{driverAlert.highlight}</span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SEKCJA 4: 🐕 OKNO NA SPACER / WYJŚCIE Z PSEM (Best Time Window)          */}
        {/* ========================================================================= */}
        <div className="flex flex-col justify-between p-4 rounded-2xl bg-black/25 border border-white/8 hover:border-white/15 transition-all">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/25">
                  <Dog className="w-5 h-5 text-emerald-300" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Okno na Spacer
                </span>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
                {walkWindow.windowStr}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white mb-1">
              {walkWindow.title}: <span className="text-emerald-300 font-extrabold">{walkWindow.windowStr}</span>
            </h4>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {walkWindow.explanation}
            </p>
          </div>

          {/* Warunki w oknie czasowym (chips) */}
          {walkWindow.highlights.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center gap-1.5">
              {walkWindow.highlights.map((item, idx) => (
                <span 
                  key={idx}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-[11px] font-semibold text-emerald-300"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
