import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Home, 
  Trees, 
  Sun, 
  Cloud, 
  CloudRain, 
  Wind, 
  Compass, 
  Gauge, 
  Droplets, 
  Wifi, 
  BatteryCharging, 
  Clock, 
  Calendar, 
  Maximize2, 
  Minimize2, 
  Sparkles, 
  ArrowUp, 
  ArrowDown, 
  ArrowRight,
  Smile,
  Meh,
  Frown,
  Activity,
  Zap,
  CheckCircle2,
  Tv
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WeatherResponse } from "../types";
import { getWindDirection } from "../utils/weatherUtils";

interface MeteoLcdConsoleProps {
  data: WeatherResponse;
  onClose?: () => void;
  fusedWindSpeed?: number;
  fusedTemp?: number;
  fusedApparentTemp?: number;
  fusedHumidity?: number;
  fusedPressure?: number;
  fusedWindGusts?: number;
  fusedWindDirection?: number;
  fusedUvIndex?: number;
  fusedPrecipitation?: number;
}

type LcdTheme = "classic" | "amber" | "cyber" | "matrix";

export default function MeteoLcdConsole({ 
  data, 
  onClose, 
  fusedWindSpeed,
  fusedTemp,
  fusedApparentTemp,
  fusedHumidity,
  fusedPressure,
  fusedWindGusts,
  fusedWindDirection,
  fusedUvIndex,
  fusedPrecipitation
}: MeteoLcdConsoleProps) {
  const [showIndoor, setShowIndoor] = useState(true);
  const [theme, setTheme] = useState<LcdTheme>("classic");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [time, setTime] = useState(new Date());

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escape key listener for exiting full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullScreen]);

  const current = data.weather.current;
  const daily = data.weather.daily;
  const hourly: any = data.weather.hourly || {};

  const now = new Date();
  const currentHourStr = now.toISOString().slice(0, 13);
  const times = hourly.time || [];
  const currentIdx = times.findIndex((t: string) => t.startsWith(currentHourStr)) !== -1 
    ? times.findIndex((t: string) => t.startsWith(currentHourStr)) 
    : 0;

  const todayDatePrefix = current?.time
    ? current.time.slice(0, 10)
    : now.toISOString().slice(0, 10);
  const matchedDailyTodayIdx = Array.isArray(daily?.time)
    ? daily.time.findIndex((t: string) => typeof t === 'string' && t.startsWith(todayDatePrefix))
    : -1;
  const todayDailyIndex = matchedDailyTodayIdx >= 0 ? matchedDailyTodayIdx : (daily?.time && daily.time.length > 1 ? 1 : 0);

  // Primary outdoor metrics - strictly synced with parent fused values
  const outdoorTemp = fusedTemp !== undefined ? fusedTemp : (hourly.temperature_2m?.[currentIdx] ?? current?.temperature_2m ?? null);
  const outdoorHumidity = fusedHumidity !== undefined ? fusedHumidity : (hourly.relative_humidity_2m?.[currentIdx] ?? current?.relative_humidity_2m ?? null);
  const feelsLike = fusedApparentTemp !== undefined ? fusedApparentTemp : (hourly.apparent_temperature?.[currentIdx] ?? current?.apparent_temperature ?? null);
  const pressure = fusedPressure !== undefined && fusedPressure > 800 ? fusedPressure : (hourly.pressure_msl?.[currentIdx] ?? current?.pressure_msl ?? null);
  const windSpeed = fusedWindSpeed !== undefined ? Math.round(fusedWindSpeed) : (hourly.wind_speed_10m?.[currentIdx] !== undefined ? Math.round(hourly.wind_speed_10m[currentIdx]) : (current?.wind_speed_10m !== undefined ? Math.round(current.wind_speed_10m) : null));
  const windGust = fusedWindGusts !== undefined ? Math.round(fusedWindGusts) : (hourly.wind_gusts_10m?.[currentIdx] !== undefined ? Math.round(hourly.wind_gusts_10m[currentIdx]) : (current?.wind_gusts_10m !== undefined ? Math.round(current.wind_gusts_10m) : null));
  const windDirDeg = fusedWindDirection !== undefined ? Math.round(fusedWindDirection) : Math.round(hourly.wind_direction_10m?.[currentIdx] ?? current?.wind_direction_10m ?? 0);
  const windDirLabel = getWindDirection(windDirDeg);
  const uvVal = fusedUvIndex !== undefined ? fusedUvIndex : (hourly.uv_index?.[currentIdx] ?? current?.uv_index ?? null);
  const rainRate = fusedPrecipitation !== undefined ? fusedPrecipitation : (hourly.precipitation?.[currentIdx] ?? current?.precipitation ?? 0);
  const dailyRain = daily?.precipitation_sum?.[todayDailyIndex] ?? 0;

  // Solar radiation and Klux light intensity (strictly 0 at night)
  const isDay = current?.is_day === 1;
  const estimatedRadiation = !isDay ? 0 : (
    typeof current?.shortwave_radiation === 'number' && current.shortwave_radiation >= 0
      ? Math.round(current.shortwave_radiation)
      : Math.round((uvVal || 0) * 80)
  );
  const klux = (estimatedRadiation * 0.126).toFixed(1);

  // Indoor proxy measurements (calculated based on building thermal inertia baseline: stable indoor climate around 21.0-22.5°C adjusted mildly by outdoor temperature)
  const hourlyTemps = hourly.temperature_2m || [];
  const last24 = hourlyTemps.slice(Math.max(0, hourlyTemps.length - 24));
  const avgTemp24h = last24.reduce((a: number, b: number) => a + b, 0) / (last24.length || 1);
  
  // Summer bias: If outdoor temp > 23°C, the house retains more heat
  let baseIndoorTemp = outdoorTemp > 23 ? 24.5 + (avgTemp24h * 0.1) : 21.0 + (avgTemp24h * 0.08);
  const indoorTemp = Math.round(baseIndoorTemp * 10) / 10;
  const indoorHumidity = Math.min(60, Math.max(35, Math.round(outdoorHumidity * 0.75)));

  // Outdoor Comfort Index
  const getOutdoorComfort = (temp: number, hum: number) => {
    if (temp >= 18 && temp <= 25 && hum >= 40 && hum <= 65) return { icon: Smile, text: "COMFORT", color: "text-emerald-400" };
    if (temp < 12 || temp > 28 || hum > 80) return { icon: Frown, text: "UNCOMFORT", color: "text-rose-400" };
    return { icon: Meh, text: "NEUTRAL", color: "text-amber-400" };
  };

  const outdoorComfort = getOutdoorComfort(outdoorTemp, outdoorHumidity);
  const indoorComfort = getOutdoorComfort(indoorTemp, indoorHumidity);

  // Wind speed category
  const getWindClass = (speed: number) => {
    if (speed < 12) return "LIGHT";
    if (speed < 29) return "MODERATE";
    if (speed < 49) return "STRONG";
    return "STORM";
  };
  const windClass = getWindClass(windSpeed);

  // Days of week polish names
  const daysPl = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];
  const dayName = daysPl[time.getDay()];
  const formattedDate = `${time.getDate().toString().padStart(2, "0")} / ${(time.getMonth() + 1).toString().padStart(2, "0")}`;
  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  // Color scheme classes based on selected theme
  const getThemeClasses = () => {
    switch (theme) {
      case "amber":
        return {
          bg: "bg-amber-950/90",
          border: "border-amber-600/50",
          textMain: "text-amber-400",
          textSub: "text-amber-500/80",
          accent: "text-amber-300",
          cardBg: "bg-amber-900/20",
          glow: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
          lcdGrid: "border-amber-600/20"
        };
      case "cyber":
        return {
          bg: "bg-slate-950",
          border: "border-cyan-500/50",
          textMain: "text-cyan-300",
          textSub: "text-cyan-500/80",
          accent: "text-blue-400",
          cardBg: "bg-cyan-950/30",
          glow: "shadow-[0_0_25px_rgba(6,182,212,0.25)]",
          lcdGrid: "border-cyan-500/20"
        };
      case "matrix":
        return {
          bg: "bg-emerald-950",
          border: "border-emerald-500/50",
          textMain: "text-emerald-400",
          textSub: "text-emerald-600/80",
          accent: "text-emerald-300",
          cardBg: "bg-emerald-900/30",
          glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
          lcdGrid: "border-emerald-500/20"
        };
      case "classic":
      default:
        return {
          bg: "bg-slate-950",
          border: "border-slate-700",
          textMain: "text-slate-100",
          textSub: "text-slate-400",
          accent: "text-amber-400",
          cardBg: "bg-slate-900/80",
          glow: "shadow-[0_10px_40px_rgba(0,0,0,0.8)]",
          lcdGrid: "border-slate-800"
        };
    }
  };

  const themeStyle = getThemeClasses();

  const content = (
    <div className={`w-full transition-all ${isFullScreen ? "fixed inset-0 z-[99999] bg-slate-950 overflow-y-auto overscroll-auto block p-4 sm:p-8 py-20" : "my-6"}`}>
      
      {/* ALWAYS VISIBLE HIGH Z-INDEX FLOATING CLOSE BUTTON IN FULLSCREEN MODE */}
      {isFullScreen && (
        <button
          onClick={() => setIsFullScreen(false)}
          className="fixed top-4 right-4 z-[999999] px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-xs rounded-2xl shadow-2xl border-2 border-white/30 flex items-center gap-2 transition-all cursor-pointer"
          title="Wyjdź z trybu pełnoekranowego (ESC)"
          id="btn-exit-fullscreen-lcd"
        >
          <Minimize2 className="w-4 h-4 text-white animate-pulse" />
          <span>Wyjdź z Pełnego Ekranu (ESC)</span>
        </button>
      )}

      <div className={`max-w-5xl w-full mx-auto bg-slate-900 border-4 border-slate-800 rounded-[2.5rem] p-3 sm:p-6 shadow-2xl relative overflow-hidden ${themeStyle.glow} ${isFullScreen ? "mb-20" : ""}`}>
        
        {/* Outer Frame Bezel Styling */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-700/20 via-transparent to-black/60 pointer-events-none rounded-[2.3rem]" />
        
        {/* Top Header & Theme Variation Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800 relative z-10 px-2">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-xs font-black tracking-widest text-slate-300 uppercase flex items-center gap-1.5">
              <Tv className="w-4 h-4 text-cyan-400" />
              Konsola Stacji Pogodowej LCD
            </span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
              METEO SP601 HIGH-PRECISION
            </span>
          </div>

          {/* Theme Variations Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Wariacje LCD:</span>
            <button
              onClick={() => setTheme("classic")}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${theme === "classic" ? "bg-cyan-500 text-white shadow" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Multistacja Kolor
            </button>
            <button
              onClick={() => setTheme("amber")}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${theme === "amber" ? "bg-amber-500 text-black shadow" : "bg-slate-800 text-slate-400 hover:text-amber-400"}`}
            >
              Bursztynowa (Amber)
            </button>
            <button
              onClick={() => setTheme("cyber")}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${theme === "cyber" ? "bg-cyan-400 text-black shadow" : "bg-slate-800 text-slate-400 hover:text-cyan-300"}`}
            >
              Cyber Cyjan
            </button>
            <button
              onClick={() => setTheme("matrix")}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all ${theme === "matrix" ? "bg-emerald-500 text-black shadow" : "bg-slate-800 text-slate-400 hover:text-emerald-400"}`}
            >
              Matryca Matrix
            </button>

            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all ml-1"
              title={isFullScreen ? "Zamknij tryb pełnoekranowy" : "Tryb Pełnoekranowy na Tablet / Ścianę"}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4 text-amber-400" />}
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-[10px] font-bold transition-all"
              >
                Zamknij
              </button>
            )}
          </div>
        </div>

        {/* PHYSICAL LCD CONSOLE DISPLAY SCREEN (Matching Photo 1:1) */}
        <div className={`rounded-2xl border-2 ${themeStyle.border} ${themeStyle.bg} p-3 sm:p-5 relative shadow-inner overflow-hidden font-mono`}>
          
          {/* Subtle Segmented LCD Grid Texture */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px] opacity-20 pointer-events-none" />

          {/* MAIN 3-COLUMN LCD GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-10">

            {/* ================= COLUMN 1: OUTDOOR & LIGHT/UV ================= */}
            <div className="space-y-3">
              
              {/* SECTION: OUTDOOR */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg} relative`}>
                <div className="flex items-center justify-between mb-1 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center space-x-1.5 text-xs font-black tracking-wider text-cyan-400 uppercase">
                    <Home className="w-3.5 h-3.5" />
                    <Trees className="w-3.5 h-3.5 text-emerald-400" />
                    <span>OUTDOOR</span>
                  </div>
                  <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-bold">ZNAK NA ZEWNĄTRZ</span>
                </div>

                {/* Big Digital Temp Display */}
                <div className="flex items-baseline justify-between my-1">
                  <div className="flex items-start">
                    <span className={`text-5xl sm:text-6xl font-black tracking-tighter ${theme === "classic" ? "text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]" : themeStyle.textMain}`}>
                      {outdoorTemp > 0 ? outdoorTemp.toFixed(1) : outdoorTemp.toFixed(1)}
                    </span>
                    <span className="text-xl font-bold text-cyan-400 ml-1">°C</span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center text-xs font-bold text-amber-400">
                      <ArrowUp className="w-3 h-3 mr-0.5" />
                      <span>{Math.round(daily?.temperature_2m_max?.[todayDailyIndex] ?? outdoorTemp + 2)}°</span>
                    </div>
                    <div className="flex items-center text-xs font-bold text-blue-400">
                      <ArrowDown className="w-3 h-3 mr-0.5" />
                      <span>{Math.round(daily?.temperature_2m_min?.[todayDailyIndex] ?? outdoorTemp - 3)}°</span>
                    </div>
                  </div>
                </div>

                {/* Humidity & Comfort */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">WILGOTNOŚĆ</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-2xl font-black ${theme === "classic" ? "text-cyan-200" : themeStyle.textMain}`}>{outdoorHumidity}</span>
                      <span className="text-xs font-bold text-cyan-400">%</span>
                    </div>
                  </div>

                  {/* Comfort Face */}
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-slate-400 uppercase block">KOMFORT</span>
                    <div className={`flex items-center space-x-1 ${outdoorComfort.color} bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800`}>
                      <outdoorComfort.icon className="w-4 h-4" />
                      <span className="text-[10px] font-bold">{outdoorComfort.text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: LIGHT & UV */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg}`}>
                <div className="flex items-center justify-between mb-1 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center space-x-1 text-xs font-black tracking-wider text-amber-400 uppercase">
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>LIGHT / UV</span>
                  </div>
                  <span className="text-[9px] text-amber-300 font-bold">NASŁONECZNIENIE</span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-1">
                  <div>
                    <span className="text-[9px] text-slate-400 block">JASNOŚĆ</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-xl font-black ${theme === "classic" ? "text-amber-300" : themeStyle.textMain}`}>{klux}</span>
                      <span className="text-[10px] font-bold text-amber-400">Klux</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 block">INDEKS UV</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-xl font-black ${uvVal > 7 ? "text-purple-400" : uvVal > 5 ? "text-rose-400" : "text-emerald-400"}`}>{Math.round(uvVal)}</span>
                      <span className="text-[10px] font-bold text-slate-400">UV</span>
                    </div>
                  </div>
                </div>

                {/* UV Segmented Gauge Bar */}
                <div className="mt-2 pt-1 border-t border-slate-800/60">
                  <div className="flex items-center justify-between text-[8px] text-slate-400 mb-1">
                    <span>NISKIE</span>
                    <span>ŚREDNIE</span>
                    <span>WYSOKIE</span>
                    <span>EKSTREMALNE</span>
                  </div>
                  <div className="flex h-2 rounded bg-slate-950 overflow-hidden p-0.5 space-x-0.5">
                    <div className={`h-full flex-1 rounded-sm ${uvVal >= 1 ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${uvVal >= 3 ? "bg-yellow-400 shadow-[0_0_6px_#facc15]" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${uvVal >= 6 ? "bg-orange-500 shadow-[0_0_6px_#f97316]" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${uvVal >= 8 ? "bg-rose-600 shadow-[0_0_6px_#e11d48]" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${uvVal >= 11 ? "bg-purple-600 shadow-[0_0_6px_#9333ea]" : "bg-slate-800"}`} />
                  </div>
                </div>

              </div>

            </div>

            {/* ================= COLUMN 2: FORECAST & WIND & RAIN ================= */}
            <div className="space-y-3">
              
              {/* SECTION: FORECAST & WIND GAUGE */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg} flex flex-col items-center justify-between relative`}>
                
                <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-1 mb-2">
                  <span className="text-xs font-black text-amber-400 tracking-wider">FORECAST & WIND</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold">WIATR & PROGNOZA</span>
                </div>

                {/* CIRCULAR WIND COMPASS ROSE DISPLAY (Matching Photo Central Circle) */}
                <div className="relative w-36 h-36 my-1 bg-slate-950 rounded-full border-2 border-indigo-500/40 p-2 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                  
                  {/* Compass Directions */}
                  <span className="absolute top-1 text-[9px] font-bold text-rose-400">N</span>
                  <span className="absolute bottom-1 text-[9px] font-bold text-slate-400">S</span>
                  <span className="absolute left-1.5 text-[9px] font-bold text-slate-400">W</span>
                  <span className="absolute right-1.5 text-[9px] font-bold text-slate-400">E</span>

                  {/* Wind Arrow Needle Rotating */}
                  <div 
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-700"
                    style={{ transform: `rotate(${windDirDeg}deg)` }}
                  >
                    <div className="w-1 h-14 bg-gradient-to-t from-transparent via-cyan-400 to-rose-500 rounded-full relative">
                      <div className="w-2.5 h-2.5 bg-rose-500 rotate-45 -top-1 -left-0.75 absolute shadow-[0_0_8px_#f43f5e]" />
                    </div>
                  </div>

                  {/* Inner Wind Values */}
                  <div className="relative z-10 text-center bg-slate-900/90 rounded-full p-2 border border-slate-800">
                    <span className="text-[8px] text-slate-400 block leading-tight">GUST {windGust}</span>
                    <span className={`text-2xl font-black ${theme === "classic" ? "text-white" : themeStyle.textMain} leading-tight block`}>
                      {windSpeed}
                    </span>
                    <span className="text-[9px] font-bold text-cyan-400 block leading-tight">km/h ({windDirLabel})</span>
                  </div>
                </div>

                {/* Wind Class Level Bar */}
                <div className="w-full mt-1 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 mb-1">
                    <span className={windClass === "LIGHT" ? "text-cyan-300 font-extrabold" : ""}>SŁABY</span>
                    <span className={windClass === "MODERATE" ? "text-emerald-300 font-extrabold" : ""}>UMIARK.</span>
                    <span className={windClass === "STRONG" ? "text-amber-300 font-extrabold" : ""}>SILNY</span>
                    <span className={windClass === "STORM" ? "text-rose-400 font-extrabold" : ""}>WICHER</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
                    <div className={`h-full flex-1 ${windSpeed >= 1 ? "bg-cyan-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 ${windSpeed >= 12 ? "bg-emerald-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 ${windSpeed >= 29 ? "bg-amber-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 ${windSpeed >= 49 ? "bg-rose-500 animate-pulse" : "bg-slate-800"}`} />
                  </div>
                </div>

              </div>

              {/* SECTION: RAIN RATE & DAILY */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg}`}>
                <div className="flex items-center justify-between mb-1 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center space-x-1 text-xs font-black tracking-wider text-blue-400 uppercase">
                    <CloudRain className="w-3.5 h-3.5 text-blue-400" />
                    <span>RAIN RATE / DAILY</span>
                  </div>
                  <span className="text-[9px] text-blue-300 font-bold">OPADY</span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-1">
                  <div>
                    <span className="text-[9px] text-slate-400 block">SUMA DOBOWA</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-2xl font-black ${theme === "classic" ? "text-blue-300" : themeStyle.textMain}`}>{dailyRain.toFixed(1)}</span>
                      <span className="text-[10px] font-bold text-blue-400">mm</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 block">INTENSYWNOŚĆ</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-2xl font-black ${rainRate > 0 ? "text-cyan-300 animate-pulse" : "text-slate-400"}`}>{rainRate.toFixed(1)}</span>
                      <span className="text-[10px] font-bold text-slate-400">mm/h</span>
                    </div>
                  </div>
                </div>

                {/* Rain Bar Visualizer */}
                <div className="mt-1 pt-1 border-t border-slate-800/60 flex items-center space-x-1 text-[8px] text-slate-400">
                  <span className="shrink-0">SKALA OPADU:</span>
                  <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden flex space-x-0.5 p-0.5">
                    <div className={`h-full flex-1 rounded-sm ${dailyRain > 0 ? "bg-blue-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${dailyRain > 2 ? "bg-cyan-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${dailyRain > 10 ? "bg-indigo-400" : "bg-slate-800"}`} />
                    <div className={`h-full flex-1 rounded-sm ${dailyRain > 25 ? "bg-purple-500" : "bg-slate-800"}`} />
                  </div>
                </div>

              </div>

            </div>

            {/* ================= COLUMN 3: INDOOR & BAROMETER ================= */}
            <div className="space-y-3">
              
              {/* SECTION: INDOOR */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg}`}>
                <div className="flex items-center justify-between mb-1 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center space-x-1.5 text-xs font-black tracking-wider text-emerald-400 uppercase">
                    <Home className="w-3.5 h-3.5 text-emerald-400" />
                    <span>EST. DOMOWA</span>
                    <button 
                      onClick={() => setShowIndoor(!showIndoor)}
                      className="text-[8px] bg-slate-700 text-slate-300 px-1 py-0 rounded hover:bg-slate-600 transition ml-2"
                    >
                      {showIndoor ? "UKRYJ" : "POKAŻ"}
                    </button>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-bold">ESTYMOWANE</span>
                </div>

                {/* Indoor Temp */}
                {showIndoor && (
                  <>
                    <div className="flex items-baseline justify-between my-1">
                      <div className="flex items-start">
                        <span className={`text-5xl sm:text-6xl font-black tracking-tighter ${theme === "classic" ? "text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]" : themeStyle.textMain}`}>
                          {indoorTemp.toFixed(1)}
                        </span>
                        <span className="text-xl font-bold text-emerald-400 ml-1">°C</span>
                      </div>
                    </div>

                    {/* Indoor Humidity & Comfort */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase block">WILG. (EST.)</span>
                        <div className="flex items-baseline space-x-1">
                          <span className={`text-2xl font-black ${theme === "classic" ? "text-emerald-200" : themeStyle.textMain}`}>{indoorHumidity}</span>
                          <span className="text-xs font-bold text-emerald-400">%</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-400 uppercase block">KOMFORT</span>
                        <div className={`flex items-center space-x-1 ${indoorComfort.color} bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800`}>
                          <indoorComfort.icon className="w-4 h-4" />
                          <span className="text-[10px] font-bold">{indoorComfort.text}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* SECTION: BAROMETER & FEELS LIKE */}
              <div className={`p-3 rounded-xl border ${themeStyle.lcdGrid} ${themeStyle.cardBg}`}>
                <div className="flex items-center justify-between mb-1 border-b border-slate-800/80 pb-1">
                  <div className="flex items-center space-x-1 text-xs font-black tracking-wider text-purple-400 uppercase">
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                    <span>BARO REL / FEELS LIKE</span>
                  </div>
                  <span className="text-[9px] text-purple-300 font-bold">BAROMETR</span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-1">
                  <div>
                    <span className="text-[9px] text-slate-400 block">CIŚNIENIE REL</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-2xl font-black ${theme === "classic" ? "text-purple-300" : themeStyle.textMain}`}>{pressure !== null ? pressure : '---'}</span>
                      <span className="text-[9px] font-bold text-purple-400">hPa</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-slate-400 block">TEMP. ODCZUW.</span>
                    <div className="flex items-baseline space-x-1">
                      <span className={`text-2xl font-black ${theme === "classic" ? "text-amber-300" : themeStyle.textMain}`}>{feelsLike !== null && !isNaN(feelsLike) ? `${feelsLike}°` : '---'}</span>
                      <span className="text-[10px] font-bold text-amber-400">C</span>
                    </div>
                  </div>
                </div>

                {/* Pressure Trend Indicator */}
                <div className="mt-1 pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 text-[9px]">TENDENCJA CIŚNIENIA:</span>
                  <div className="flex items-center space-x-1 text-emerald-400 font-bold">
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>STABILNE / ROŚNIE</span>
                  </div>
                </div>

              </div>

            </div>

          </div>

          {/* ================= BOTTOM BAR: TIME, ALARM & DATE ================= */}
          <div className="mt-4 pt-3 border-t-2 border-slate-800 flex flex-wrap items-center justify-between gap-3 relative z-10 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            
            {/* Wi-Fi & Station Connection Status */}
            <div className="flex items-center space-x-2">
              <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
              <div className="text-[10px]">
                <span className="text-slate-300 font-bold block leading-none">WI-FI ONLINE</span>
                <span className="text-[8px] text-slate-400 font-mono">SIGNAL 100% (-42 dBm)</span>
              </div>
            </div>

            {/* REAL-TIME DIGITAL CLOCK */}
            <div className="flex items-center space-x-2 bg-slate-950 px-4 py-1.5 rounded-xl border border-slate-800">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className={`text-2xl sm:text-3xl font-black tracking-widest ${theme === "classic" ? "text-amber-300" : themeStyle.textMain}`}>
                {hours}<span className="animate-pulse">:</span>{minutes}<span className="text-xs text-amber-500 font-bold ml-1">{seconds}</span>
              </span>
            </div>

            {/* DAY & DATE */}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <div className="text-right">
                <span className={`text-lg font-black block leading-none ${theme === "classic" ? "text-cyan-200" : themeStyle.textMain}`}>
                  {dayName} {formattedDate}
                </span>
                <span className="text-[8px] text-slate-400 uppercase tracking-wider block">KALENDARZ STACJI</span>
              </div>
            </div>

            {/* USB Power / Battery */}
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 border-l border-slate-800 pl-3">
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold text-slate-300">USB 5V (NADAJNIK SP601)</span>
            </div>

          </div>

        </div>

        {/* Console Bottom Brand Plate */}
        <div className="text-center mt-3 relative z-10 flex items-center justify-center space-x-2">
          <div className="h-[1px] w-12 bg-slate-800" />
          <span className="text-xs font-black tracking-widest text-slate-400 uppercase font-sans">
            meteo
          </span>
          <div className="h-[1px] w-12 bg-slate-800" />
        </div>

      </div>
    </div>
  );

  return isFullScreen ? createPortal(content, document.body) : content;
}
