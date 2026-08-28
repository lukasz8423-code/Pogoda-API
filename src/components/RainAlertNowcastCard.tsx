import { motion } from "motion/react";
import { CloudRain, CloudOff, AlertTriangle, Clock } from "lucide-react";
import { WeatherResponse } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";

interface RainAlertNowcastCardProps {
  data: WeatherResponse;
}

export default function RainAlertNowcastCard({ data }: RainAlertNowcastCardProps) {
  if (!data?.weather) return null;
  const { minutely_15, hourly, current } = data.weather;

  // Extract upcoming 2-3 hours of precipitation intervals
  let timelineItems: Array<{
    timeLabel: string;
    precipMm: number;
    probPercent: number;
    isNow?: boolean;
  }> = [];

  const now = new Date();

  if (minutely_15 && minutely_15.time && minutely_15.time.length > 0) {
    // Parse 15-min intervals
    for (let i = 0; i < minutely_15.time.length; i++) {
      const itemTime = new Date(minutely_15.time[i]);
      // Only keep present and next ~2.5 hours
      if (itemTime.getTime() >= now.getTime() - 10 * 60 * 1000 && timelineItems.length < 10) {
        const timeStr = itemTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        const precipMm = Number(minutely_15.precipitation?.[i] || 0);
        const prob = minutely_15.precipitation_probability?.[i] !== undefined 
          ? Number(minutely_15.precipitation_probability[i]) 
          : (precipMm > 0 ? 85 : 10);

        timelineItems.push({
          timeLabel: timeStr,
          precipMm: Math.max(0, precipMm),
          probPercent: prob,
          isNow: timelineItems.length === 0,
        });
      }
    }
  }

  // Fallback to hourly if minutely_15 not available or empty
  if (timelineItems.length === 0 && hourly && hourly.time) {
    for (let i = 0; i < hourly.time.length; i++) {
      const itemTime = new Date(hourly.time[i]);
      if (itemTime.getTime() >= now.getTime() - 30 * 60 * 1000 && timelineItems.length < 8) {
        const timeStr = itemTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        const precipMm = Number(hourly.precipitation?.[i] || 0);
        const prob = Number(hourly.precipitation_probability?.[i] || 0);

        timelineItems.push({
          timeLabel: timeStr,
          precipMm: Math.max(0, precipMm),
          probPercent: prob,
          isNow: timelineItems.length === 0,
        });
      }
    }
  }

  // Determine storm and rain status & alert message
  const stormInfo = checkStormStatus(current, hourly);
  const isCurrentlyRaining = (current?.precipitation || 0) > 0.05 || (timelineItems[0]?.precipMm || 0) > 0.05 || stormInfo.isStorm;
  const upcomingRainItem = timelineItems.find((item, idx) => idx > 0 && (item.precipMm > 0.1 || item.probPercent >= 50));

  let alertBadgeText = "";
  let alertHeadline = "";
  let alertTheme: "dry" | "rainSoon" | "rainingNow" | "storm" = "dry";

  if (stormInfo.isStorm) {
    alertTheme = "storm";
    alertBadgeText = "⚡ WYKRYTO BURZĘ Z PIORUNAMI";
    alertHeadline = stormInfo.message;
  } else if (stormInfo.isStormRisk) {
    alertTheme = "rainSoon";
    alertBadgeText = "🌩️ RYZYKO BURZY Z GUSTAMI WIATRU";
    alertHeadline = stormInfo.message;
  } else if (isCurrentlyRaining) {
    alertTheme = "rainingNow";
    const stoppingItem = timelineItems.find((item, idx) => idx > 0 && item.precipMm < 0.05 && item.probPercent < 30);
    alertBadgeText = "TRWAJĄ OPADY DESZCZU";
    alertHeadline = stoppingItem 
      ? `Możliwe osłabienie opadów ok. godz. ${stoppingItem.timeLabel}` 
      : "Opady utrzymają się przez najbliższą godzinę";
  } else if (upcomingRainItem) {
    alertTheme = "rainSoon";
    alertBadgeText = `OPADY ZA OK. ${upcomingRainItem.timeLabel}`;
    alertHeadline = `Możliwy deszcz (~${upcomingRainItem.precipMm.toFixed(1)} mm/h, ${upcomingRainItem.probPercent}% szans)`;
  } else {
    alertTheme = "dry";
    alertBadgeText = "BRAK OPADÓW";
    alertHeadline = "Brak opadów przez najbliższe 2 godziny";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 rounded-3xl border backdrop-blur-md shadow-xl relative overflow-hidden transition-all ${
        alertTheme === "storm"
          ? "bg-gradient-to-br from-purple-950/90 via-red-950/80 to-slate-900/90 border-red-500/50"
          : alertTheme === "rainingNow"
          ? "bg-gradient-to-br from-blue-950/90 via-slate-900/90 to-blue-900/80 border-blue-500/40"
          : alertTheme === "rainSoon"
          ? "bg-gradient-to-br from-amber-950/80 via-slate-900/90 to-slate-900/90 border-amber-500/40"
          : "bg-slate-900/80 border-slate-700/60"
      }`}
    >
      {/* Background ambient glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 bg-blue-500 pointer-events-none" />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2.5">
          <div
            className={`p-2.5 rounded-2xl border ${
              alertTheme === "rainingNow"
                ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                : alertTheme === "rainSoon"
                ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                : "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
            }`}
          >
            {alertTheme === "dry" ? (
              <CloudOff className="w-5 h-5" />
            ) : (
              <CloudRain className="w-5 h-5 animate-bounce" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Radar Opadowy Nowcast
            </span>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Alert Opadowy</span>
            </h3>
          </div>
        </div>

        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${
            alertTheme === "rainingNow"
              ? "bg-blue-500/30 text-blue-200 border-blue-400/50"
              : alertTheme === "rainSoon"
              ? "bg-amber-500/30 text-amber-200 border-amber-400/50"
              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
          }`}
        >
          {alertBadgeText}
        </span>
      </div>

      {/* Main Alert Message Banner */}
      <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 mb-4 flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-extrabold text-white">{alertHeadline}</p>
          <p className="text-[11px] text-slate-300 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-cyan-400 inline" />
            <span>Prognoza minitowa na najbliższe 120 minut (Open-Meteo Radar)</span>
          </p>
        </div>
        {alertTheme === "rainSoon" && (
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 ml-2 animate-pulse" />
        )}
      </div>

      {/* Minutely / Hourly Precipitation Bar Chart Timeline */}
      {timelineItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-1">
            <span>Oś Czasu (Opad mm/h)</span>
            <span>Szansa %</span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 pt-1">
            {timelineItems.map((item, idx) => {
              const maxBarHeight = 36; // px
              const heightPx = Math.min(maxBarHeight, Math.max(6, item.precipMm * 15));
              const hasPrecip = item.precipMm > 0.05 || item.probPercent >= 40;

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                    item.isNow
                      ? "bg-blue-600/20 border-blue-400/50 shadow-md"
                      : hasPrecip
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-slate-800/40 border-slate-700/40"
                  }`}
                >
                  <span className="text-[9px] font-bold text-slate-300 mb-1">{item.timeLabel}</span>

                  <div className="w-full h-9 flex items-end justify-center my-0.5">
                    <div
                      style={{ height: `${heightPx}px` }}
                      className={`w-3 rounded-t-sm transition-all ${
                        hasPrecip
                          ? "bg-gradient-to-t from-blue-500 to-cyan-300"
                          : "bg-slate-700/50"
                      }`}
                    />
                  </div>

                  <span
                    className={`text-[9px] font-mono font-bold mt-1 ${
                      hasPrecip ? "text-cyan-300" : "text-slate-500"
                    }`}
                  >
                    {item.precipMm > 0 ? `${item.precipMm.toFixed(1)}` : `${item.probPercent}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
