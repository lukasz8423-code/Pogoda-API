import * as React from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Umbrella, 
  Sun, 
  Wind, 
  ThermometerSnowflake, 
  Sparkles, 
  ShieldAlert, 
  Check, 
  BellRing,
  Footprints,
  Info
} from "lucide-react";
import { WeatherResponse } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";

interface WeatherAdviceCardsProps {
  data: WeatherResponse;
}

interface AdviceItem {
  id: string;
  type: "rain" | "uv" | "wind" | "cold" | "nice" | "storm";
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  severity: "high" | "medium" | "info";
  actionText: string;
  badge: string;
}

export default React.memo(function WeatherAdviceCards({ data }: WeatherAdviceCardsProps) {
  const [notedIds, setNotedIds] = useState<string[]>([]);
  const [showNotificationModal, setShowNotificationModal] = useState<string | null>(null);

  const { city: rawCity, weather } = data || {};
  const currentCityName = rawCity ? rawCity.split(',')[0].trim() : "Twojej lokalizacji";
  const current = weather?.current || (data as any)?.current || {};
  const daily = weather?.daily || (data as any)?.daily || {};
  const hourly = weather?.hourly || (data as any)?.hourly || {};

  const generateAdvice = (): AdviceItem[] => {
    const list: AdviceItem[] = [];

    // 1. Humorystyczny Smart Alercik Deszczowy (Chowanie gaci i cytrusów)
    const currentPop = Array.isArray(hourly?.precipitation_probability) ? (hourly.precipitation_probability[0] ?? 0) : 0;
    const isRainingNow = (current?.precipitation ?? 0) > 0;
    
    // Check if rain starts in next 4 hours
    let rainSoonHour: number | null = null;
    let rainSoonProb = 0;
    if (hourly && hourly.precipitation_probability && hourly.time) {
      for (let i = 1; i <= 4; i++) {
        const prob = hourly.precipitation_probability[i] || 0;
        if (prob >= 30) {
          rainSoonHour = new Date(hourly.time[i]).getHours();
          rainSoonProb = prob;
          break;
        }
      }
    }

    if (isRainingNow || currentPop >= 40) {
      list.push({
        id: "smart-rain-now",
        type: "rain",
        title: "Alercik! Idzie deszcz! 🌧️",
        description: "Wariacie, uciekaj ze schnącym praniem! Chowaj gacie z balkonu i rzuć okiem na swoje cytrusy w ogrodzie, bo zaraz napada do doniczek!",
        icon: Umbrella,
        severity: "high",
        actionText: "Pranie schowane!",
        badge: "ALERCIDDESZCZ"
      });
    } else if (rainSoonHour !== null) {
      list.push({
        id: "smart-rain-soon",
        type: "rain",
        title: "Chowaj gacie, idzie deszcz! 🧺",
        description: `Około godziny ${rainSoonHour}:00 szykuje się opad (${rainSoonProb}% szans). Zabezpiecz pranie i ogródek z cytrusami przed ulewą!`,
        icon: Umbrella,
        severity: "medium",
        actionText: "Doniczki schowane",
        badge: "Zaraz deszcz"
      });
    }

    // 2. Humorystyczny Smart Alercik temperaturowy ("Zdejmuj katankę, wariacie!")
    const currentTemp = current.temperature_2m ?? 15;
    const roundTemp = Math.round(currentTemp);
    
    // Check future temp in 2-3 hours
    let futureTemp: number | null = null;
    if (hourly && hourly.temperature_2m) {
      futureTemp = hourly.temperature_2m[2] || hourly.temperature_2m[3] || null;
    }

    if (currentTemp >= 22) {
      list.push({
        id: "smart-strip-jacket-now",
        type: "nice",
        title: "Katanka do szafy! 👕",
        description: `Na termometrze mamy już solidne ${roundTemp}°C. Wariacie, krótki rękawek i ruszaj w miasto bez zbędnych warstw!`,
        icon: Sun,
        severity: "info",
        actionText: "T-shirt mode ON",
        badge: "UPALIK"
      });
    } else if (currentTemp >= 18) {
      // Comfortably warm (e.g. 19°C)
      list.push({
        id: "smart-temp-comfortable",
        type: "nice",
        title: `Komfortowe ${roundTemp}°C na liczniku! 🌤️`,
        description: `Aktualna temperatura w ${currentCityName} wynosi ${roundTemp}°C. Wariacie, katanka i grube ubrania zostają w szafie – t-shirt lub lekka bluza wystarczą w zupełności!`,
        icon: Sun,
        severity: "info",
        actionText: "Idealna pogoda!",
        badge: "ŁADNA POGODA"
      });
    } else if (futureTemp !== null && futureTemp >= 21 && currentTemp < futureTemp) {
      list.push({
        id: "smart-strip-jacket",
        type: "nice",
        title: "Wariacie, zdejmuj katankę! ☀️",
        description: `Za dwie godziny słońce przygrzeje do ${Math.round(futureTemp)}°C! Zdejmuj kurtkę, bo się ugotujesz na tym spacerze!`,
        icon: Sun,
        severity: "info",
        actionText: "Katanka zdjęta!",
        badge: "SŁOŃCE PRZYGRZEJE"
      });
    }

    // 3. Humorystyczny Smart Alercik o nagłym spadku temperatury ("Zarzuć katankę!")
    // STRICT RULE: ONLY show cold / jacket alert if currentTemp < 15°C AND it's genuinely dropping or cold!
    if (currentTemp < 15 && (currentTemp <= 10 || (futureTemp !== null && currentTemp - futureTemp >= 4.0))) {
      list.push({
        id: "smart-wear-jacket",
        type: "cold",
        title: "Wariacie, zarzuć katankę! 🥶",
        description: `Chłodno na zewnątrz (${roundTemp}°C)! Lepiej weź cieplejszą kurtkę ze sobą, bo zmarzniesz jak kurczak!`,
        icon: ThermometerSnowflake,
        severity: "medium",
        actionText: "Katanka spakowana",
        badge: "OCHŁODZENIE"
      });
    }

    // 4. Wichura Alercik ("Trzymaj czapkę!")
    const windSpeed = current.wind_speed_10m ?? 0;
    const windGusts = current.wind_gusts_10m ?? 0;
    if (windGusts >= 35 || windSpeed >= 22) {
      list.push({
        id: "smart-windy-crazy",
        type: "wind",
        title: "Trzymaj czapkę, wariacie! 💨",
        description: `Wieje do ${Math.round(windGusts || windSpeed)} km/h! Zabezpiecz stoliki i krzesła na balkonie, zanim odlecą do sąsiada.`,
        icon: Wind,
        severity: "high",
        actionText: "Wszystko przypięte",
        badge: "PIŹDZI JAK KIELECKIEM"
      });
    }

    // 5. Storm Alercik
    const stormInfo = checkStormStatus(current, hourly);
    if (stormInfo.isStorm || stormInfo.isStormRisk) {
      list.push({
        id: "smart-storm-apocalypse",
        type: "storm",
        title: stormInfo.isStorm ? "Armagedon nadchodzi! ⚡" : "Uwaga! Idzie Burza 🌩️",
        description: stormInfo.message,
        icon: ShieldAlert,
        severity: stormInfo.isStorm ? "high" : "medium",
        actionText: "Wyjmij wtyczki!",
        badge: stormInfo.isStorm ? "BURZA W MIEŚCIE" : "RYZYKO BURZY"
      });
    }

    // 6. Real dynamic UV Card - attenuated strictly by cloud cover
    const currentCloudCover = current.cloud_cover ?? 0;
    const isOvercast = currentCloudCover >= 60;
    const uvAttenuation = isOvercast ? 0.3 : (currentCloudCover >= 30 ? 0.6 : 1.0);
    const rawMaxUv = Array.isArray(daily?.uv_index_max) ? (daily.uv_index_max[0] ?? (current.uv_index ?? 0)) : (current.uv_index ?? 0);
    const effectiveUvToday = rawMaxUv * uvAttenuation;

    if (effectiveUvToday >= 6 && !isOvercast) {
      list.push({
        id: "smart-uv-high",
        type: "uv",
        title: "Mocne słońce! 🧴",
        description: `Indeks UV w słonecznych momentach osiągnie ${effectiveUvToday.toFixed(1)}. Nakładaj krem z filtrem i chroń głowę!`,
        icon: Sun,
        severity: "high",
        actionText: "Krem nałożony",
        badge: "OCHRONA UV"
      });
    } else if (effectiveUvToday >= 3 && effectiveUvToday < 6 && !isRainingNow && !isOvercast) {
      list.push({
        id: "smart-uv-moderate",
        type: "uv",
        title: "Umiarkowane słońce 🕶️",
        description: `Umiarkowane promieniowanie UV (${effectiveUvToday.toFixed(1)}). Okulary przeciwsłoneczne ułatwią spacer!`,
        icon: Sun,
        severity: "info",
        actionText: "Okulary mam",
        badge: "SŁONECZNIE"
      });
    }

    // 7. Comfort walk / Nice weather cards
    const isNiceDay = currentTemp >= 15 && currentTemp <= 21 && !isRainingNow && current.weather_code <= 2;
    if (isNiceDay) {
      list.push({
        id: "smart-nice-walk",
        type: "nice",
        title: "Spacer idealny! 🌳",
        description: `Temperatura wynosi komfortowe ${Math.round(currentTemp)}°C bez opadów. Wspaniała aura na spacer po ${currentCityName} i złapanie świeżego oddechu!`,
        icon: Footprints,
        severity: "info",
        actionText: "Wychodzę na spacer",
        badge: "POGODA OK"
      });
    }

    // 8. Humidity & Citrus care
    const humidity = current.relative_humidity_2m;
    if (typeof humidity === 'number' && humidity >= 85 && !isRainingNow) {
      list.push({
        id: "smart-humidity-high",
        type: "nice",
        title: "Wilgotne powietrze! 🧴",
        description: `Wilgotność wynosi aż ${humidity}%. Wariacie, to idealne warunki dla Twoich cytrusów, ale pranie uciekaj schować, bo nie wyschnie!`,
        icon: Sparkles,
        severity: "info",
        actionText: "Wietrzę dom",
        badge: "WILGOTNOŚĆ"
      });
    }

    // Fallback/Always visible real stable weather cards so list is never empty
    if (list.length === 0) {
      list.push({
        id: "smart-stable-day",
        type: "nice",
        title: "Spokojny dzień przed nami! ☕",
        description: `Aktualna temperatura wynosi ${Math.round(currentTemp)}°C. Warunki są stabilne i bezpieczne, ciesz się dniem, wariacie!`,
        icon: Sparkles,
        severity: "info",
        actionText: "Dzięki!",
        badge: "STABILNY DZIEŃ"
      });
    }

    return list;
  };

  const adviceList = generateAdvice().filter(item => !notedIds.includes(item.id));

  const handleToggleNoted = (id: string) => {
    setNotedIds(prev => [...prev, id]);
  };

  const triggerSimulatedPush = (item: AdviceItem) => {
    setShowNotificationModal(item.id);
    // Auto close after 3.5 seconds
    setTimeout(() => {
      setShowNotificationModal(null);
    }, 3500);
  };

  if (adviceList.length === 0) {
    return (
      <div className="bg-slate-900/30 border border-slate-800/40 rounded-3xl p-4 text-center text-slate-400 text-xs">
        ✨ Wszystkie dzisiejsze porady zostały odznaczone jako przeczytane.
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6" id="weather-advice-section">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Rekomendacje & Porady</span>
        </h3>
        <span className="text-[10px] text-slate-500 font-semibold uppercase">
          {adviceList.length} {adviceList.length === 1 ? 'porada' : 'porady'}
        </span>
      </div>

      {/* Horizontal Carousel of Actionable Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
        <AnimatePresence mode="popLayout">
          {adviceList.map((item) => {
            const IconComponent = item.icon;
            
            // Border & Background depending on severity
            const borderClass = 
              item.severity === "high" 
                ? "border-red-500/40 bg-gradient-to-br from-red-950/40 via-slate-900/90 to-slate-950/95" 
                : item.severity === "medium"
                ? "border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-slate-900/90 to-slate-950/95"
                : "border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-slate-900/90 to-slate-950/95";

            const badgeColor = 
              item.severity === "high"
                ? "bg-red-500/20 text-red-300 border-red-500/30"
                : item.severity === "medium"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                : "bg-blue-500/20 text-blue-300 border-blue-500/30";

            return (
              <div key={item.id} className="snap-center shrink-0 [perspective:1500px]">
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  whileHover={{ rotateY: -3, rotateX: 3, translateZ: 40, scale: 1.02 }}
                  exit={{ opacity: 0, scale: 0.9, x: -50 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  style={{ transformStyle: "preserve-3d" }}
                  className={`w-[300px] p-6 rounded-[32px] border ${borderClass} flex flex-col justify-between shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden h-[240px]`}
                >
                  {/* Background soft lighting orb */}
                  <div className={`absolute -right-16 -top-16 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none ${
                    item.severity === "high" ? "bg-red-500" : item.severity === "medium" ? "bg-amber-500" : "bg-blue-500"
                  }`}></div>

                  <div style={{ transform: "translateZ(20px)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className={`text-[9px] font-black tracking-[0.2em] uppercase px-3 py-1 rounded-xl border ${badgeColor}`}>
                        {item.badge}
                      </span>
                      
                      {/* Simulated push notification button */}
                      <button
                        onClick={() => triggerSimulatedPush(item)}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded-xl transition-all shadow-lg border border-transparent hover:border-white/10"
                        title="Przetestuj powiadomienie push"
                      >
                        <BellRing className="w-4 h-4 animate-bounce" />
                      </button>
                    </div>

                    <div className="flex items-start gap-4 mt-2">
                      <div className={`p-3 rounded-2xl border shrink-0 shadow-lg ${
                        item.severity === "high" 
                          ? "bg-red-950/40 border-red-500/30 text-red-400" 
                          : item.severity === "medium"
                          ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                          : "bg-blue-950/40 border-blue-500/30 text-blue-400"
                      }`} style={{ transform: "translateZ(30px)" }}>
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div className="space-y-1" style={{ transform: "translateZ(10px)" }}>
                        <h4 className="text-sm font-black text-white leading-tight uppercase tracking-tighter">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-slate-300 font-bold leading-relaxed line-clamp-3 italic">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-2" style={{ transform: "translateZ(15px)" }}>
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">
                      <Info className="w-3 h-3 text-indigo-400" />
                      Rekomendacja
                    </span>
                    
                    <button
                      onClick={() => handleToggleNoted(item.id)}
                      className="px-4 py-1.5 text-[10px] font-black bg-white/5 hover:bg-indigo-600 border border-white/10 hover:border-indigo-400 text-slate-200 hover:text-white rounded-xl transition-all flex items-center gap-2 active:scale-95 shadow-md uppercase tracking-tighter"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{item.actionText}</span>
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Simulated Push Notification Toast UI */}
      <AnimatePresence>
        {showNotificationModal && (() => {
          const matchingItem = adviceList.find(i => i.id === showNotificationModal);
          if (!matchingItem) return null;
          const MatchingIcon = matchingItem.icon;
          return (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 12, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="absolute top-16 left-4 right-4 z-50 p-3.5 bg-slate-900/95 border border-blue-500/50 rounded-2xl shadow-2xl flex items-start gap-3 backdrop-blur-md"
            >
              <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
                <MatchingIcon className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                    Powiadomienie Push 🔔
                  </span>
                  <span className="text-[8px] text-slate-500 font-bold">Teraz</span>
                </div>
                <h5 className="text-xs font-bold text-white leading-tight">
                  {matchingItem.title}
                </h5>
                <p className="text-[10px] text-slate-300 font-medium leading-normal mt-1">
                  {matchingItem.description}
                </p>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
})