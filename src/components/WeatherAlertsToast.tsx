import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wind, CloudRain, Zap, Sun, X } from "lucide-react";
import { WeatherResponse } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";

interface WeatherAlertsToastProps {
  data: WeatherResponse;
}

interface AlertItem {
  id: string;
  type: "wind" | "rain" | "storm" | "uv";
  title: string;
  message: string;
  icon: any;
  colorClass: string;
}

export default function WeatherAlertsToast({ data }: WeatherAlertsToastProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data || !data.weather) return;
    const current = data.weather.current;
    const hourly = data.weather.hourly;
    const newAlerts: AlertItem[] = [];

    if (!current) return;

    // 1. Wind Check
    const windSpeed = current.wind_speed_10m || 0;
    const windGusts = current.wind_gusts_10m || windSpeed;
    if (windSpeed > 45 || windGusts > 65) {
      newAlerts.push({
        id: "wind-alert",
        type: "wind",
        title: "Silny wiatr i porywy",
        message: `Prędkość wiatru osiąga ${Math.round(windSpeed)} km/h (porywy do ${Math.round(windGusts)} km/h). Zachowaj ostrożność.`,
        icon: Wind,
        colorClass: "from-amber-950/90 via-amber-900/80 to-slate-900/90 border-amber-500/50 text-amber-300"
      });
    }

    // 2. Rain / Precipitation Check
    const precip = current.precipitation || 0;
    const weatherCode = current.weather_code || 0;
    const isRainCode = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82);
    
    if (precip > 1.5 || (isRainCode && precip > 0)) {
      newAlerts.push({
        id: "rain-alert",
        type: "rain",
        title: "Intensywne opady",
        message: `Występują opady deszczu (${precip.toFixed(1)} mm/h). Widoczność może być ograniczona.`,
        icon: CloudRain,
        colorClass: "from-blue-950/90 via-cyan-950/80 to-slate-900/90 border-blue-500/50 text-cyan-300"
      });
    }

    // 3. Storm Check using checkStormStatus
    const stormInfo = checkStormStatus(current, hourly);
    if (stormInfo.isStormRisk || stormInfo.isStorm) {
      newAlerts.push({
        id: "storm-alert",
        type: "storm",
        title: stormInfo.title,
        message: stormInfo.message,
        icon: Zap,
        colorClass: stormInfo.isStorm 
          ? "from-purple-950/95 via-red-950/90 to-slate-900/95 border-red-500/60 text-purple-200 animate-pulse"
          : "from-purple-950/90 via-indigo-950/80 to-slate-900/90 border-purple-500/50 text-purple-300"
      });
    }

    // 4. Rain forecast in the next 1-3 hours
    if (hourly && hourly.time && hourly.precipitation_probability) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const currentHourPrefix = `${year}-${month}-${day}T${hour}`;

      let startIndex = hourly.time.findIndex(t => t.startsWith(currentHourPrefix));
      if (startIndex === -1) {
        const hourNum = now.getHours();
        startIndex = hourly.time.findIndex(t => {
          const tDate = new Date(t);
          return tDate.getHours() === hourNum && tDate.getDate() === now.getDate();
        });
      }
      
      if (startIndex !== -1) {
        // Check next 3 hours
        for (let offset = 1; offset <= 3; offset++) {
          const nextIdx = startIndex + offset;
          if (nextIdx < hourly.time.length) {
            const prob = hourly.precipitation_probability[nextIdx] || 0;
            if (prob >= 35) {
              const forecastTime = new Date(hourly.time[nextIdx]);
              const timeLabel = forecastTime.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
              newAlerts.push({
                id: `rain-forecast-${nextIdx}`,
                type: "rain",
                title: "Nadchodzące opady",
                message: `Prognoza wskazuje na ${prob}% szans na deszcz w najbliższym czasie (ok. ${timeLabel}). Przygotuj parasol!`,
                icon: CloudRain,
                colorClass: "from-sky-950/95 via-blue-900/90 to-slate-950/95 border-sky-500/50 text-sky-200"
              });
              break;
            }
          }
        }
      }
    }

    // 5. UV Check
    const uvIndex = current.uv_index || 0;
    if (uvIndex >= 7) {
      newAlerts.push({
        id: "uv-alert",
        type: "uv",
        title: "Wysokie promieniowanie UV",
        message: `Indeks UV wynosi ${uvIndex.toFixed(1)}. Stosuj kremy z filtrem i ogranicz ekspozycję na słońce.`,
        icon: Sun,
        colorClass: "from-orange-950/90 via-amber-950/80 to-slate-900/90 border-orange-500/50 text-orange-300"
      });
    }

    setAlerts(newAlerts);
  }, [data]);

  const dismissAlert = (id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  };

  const activeAlerts = alerts.filter(a => !dismissedIds.has(a.id));

  if (activeAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
      <AnimatePresence>
        {activeAlerts.map(alert => {
          const IconComponent = alert.icon;
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 25 }}
              className={`pointer-events-auto bg-gradient-to-r ${alert.colorClass} border rounded-2xl p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden flex items-start space-x-3`}
              id={`toast-alert-${alert.type}`}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
              <div className="p-2.5 bg-white/10 rounded-xl border border-white/10 shrink-0">
                <IconComponent className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    {alert.title}
                  </h4>
                </div>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  {alert.message}
                </p>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title="Zamknij powiadomienie"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
