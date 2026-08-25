import { motion } from "motion/react";
import React, { useEffect, useState, useMemo } from "react";

interface AmbientWeatherEffectProps {
  weatherCode: number;
  isDay: boolean;
  cloudCover?: number;
}

interface Particle {
  id: number;
  left: string;
  delay: number;
  duration: number;
  scale?: number;
  drift?: number;
  size?: number;
}

interface Star {
  id: number;
  top: string;
  left: string;
  duration: number;
  delay: number;
}

export default React.memo(function AmbientWeatherEffect({ weatherCode, isDay, cloudCover }: AmbientWeatherEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  // Categorize weather code and cloud cover
  const isRain = (weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82) || (weatherCode >= 95 && weatherCode <= 99);
  const isSnow = (weatherCode >= 71 && weatherCode <= 77) || (weatherCode >= 85 && weatherCode <= 86);
  const isCloudy = (weatherCode === 2 || weatherCode === 3 || weatherCode === 45 || weatherCode === 48) || (cloudCover !== undefined && cloudCover >= 40);
  const isClear = weatherCode <= 1 && (cloudCover === undefined || cloudCover < 40);

  const staticStars = useMemo<Star[]>(() => {
    const stars: Star[] = [];
    for (let i = 0; i < 15; i++) {
      stars.push({
        id: i,
        top: `${Math.random() * 45}%`,
        left: `${Math.random() * 100}%`,
        duration: 2 + Math.random() * 3,
        delay: Math.random() * 3,
      });
    }
    return stars;
  }, []);

  useEffect(() => {
    // Generate static list of random particles once to avoid infinite re-renders or hydration mismatches
    const items: Particle[] = [];
    const count = isRain ? 25 : isSnow ? 20 : isCloudy ? 4 : 0;

    for (let i = 0; i < count; i++) {
      items.push({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 5,
        duration: isRain ? 1.2 + Math.random() * 0.8 : isSnow ? 4 + Math.random() * 4 : 25 + Math.random() * 15,
        scale: 0.3 + Math.random() * 0.7,
        drift: -50 + Math.random() * 100, // horizontal drift for snow/clouds
        size: isCloudy ? 80 + Math.random() * 120 : undefined,
      });
    }
    setParticles(items);
  }, [isRain, isSnow, isCloudy]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" id="ambient-weather-layer">
      {/* 1. SUNNY/CLEAR DAY EFFECT: Rotating rays and pulsing subtle halo in upper right */}
      {isClear && isDay && (
        <div className="absolute -top-12 -right-12 w-64 h-64 flex items-center justify-center">
          {/* Main glowing sun core in background */}
          <motion.div
            className="absolute w-44 h-44 rounded-full bg-amber-400/10 blur-2xl"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 0.9, 0.6],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          {/* Slow rotating solar corona / light rings */}
          <motion.div
            className="w-56 h-56 rounded-full border border-amber-300/10 border-dashed"
            animate={{ rotate: 360 }}
            transition={{
              duration: 40,
              repeat: Infinity,
              ease: "linear",
            }}
          />
          <motion.div
            className="absolute w-48 h-48 rounded-full border border-amber-200/5"
            animate={{ rotate: -360 }}
            transition={{
              duration: 60,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </div>
      )}

      {/* 2. RAIN/STORM EFFECT: Falling vertical streaks */}
      {isRain && (
        <div className="absolute inset-0 w-full h-full">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute w-[1.5px] bg-gradient-to-b from-cyan-300/40 via-blue-400/20 to-transparent"
              style={{
                left: p.left,
                top: "-10%",
                height: "60px",
                scale: p.scale,
              }}
              initial={{ y: "-10%", opacity: 0 }}
              animate={{
                y: "110vh",
                opacity: [0, 0.7, 0.7, 0],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}

      {/* 3. SNOW EFFECT: Gently falling and swaying white crystals */}
      {isSnow && (
        <div className="absolute inset-0 w-full h-full">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute bg-white/40 rounded-full blur-[0.5px]"
              style={{
                left: p.left,
                top: "-5%",
                width: `${(p.scale ?? 1) * 6}px`,
                height: `${(p.scale ?? 1) * 6}px`,
              }}
              initial={{ y: "-5%", opacity: 0 }}
              animate={{
                y: "110vh",
                x: [0, p.drift ?? 30, 0, -(p.drift ?? 30), 0],
                opacity: [0, 0.8, 0.8, 0],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}

      {/* 4. CLOUDY / FOG EFFECT: Semi-transparent clouds floating lazily */}
      {isCloudy && (
        <div className="absolute inset-0 w-full h-full overflow-hidden opacity-30">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute bg-gradient-to-br from-slate-300/10 to-slate-400/5 rounded-full blur-2xl"
              style={{
                width: `${p.size}px`,
                height: `${(p.size ?? 100) * 0.6}px`,
                left: "-30%",
                top: `${15 + p.id * 18}%`,
              }}
              animate={{
                x: ["0vw", "140vw"],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}

      {/* 5. NIGHT / CLEAR STAR EFFECT: Twinkling subtle stars for clear night */}
      {!isDay && isClear && (
        <div className="absolute inset-0 w-full h-full">
          {staticStars.map((star) => (
            <motion.div
              key={star.id}
              className="absolute w-[2px] h-[2px] bg-white rounded-full"
              style={{
                top: star.top,
                left: star.left,
              }}
              animate={{
                opacity: [0.1, 0.9, 0.1],
                scale: [1, 1.4, 1],
              }}
              transition={{
                duration: star.duration,
                repeat: Infinity,
                delay: star.delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});
