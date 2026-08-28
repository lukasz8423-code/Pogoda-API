import { 
  Sun, 
  Moon, 
  CloudSun, 
  CloudMoon, 
  Cloud, 
  CloudFog, 
  CloudDrizzle, 
  CloudRain, 
  CloudSnow, 
  Snowflake, 
  CloudLightning,
  Sparkles
} from "lucide-react";
import { motion } from "motion/react";

interface AiWeatherIconProps {
  code: number;
  isDay: boolean;
  cloudCover?: number;
  precip?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function AiWeatherIcon({
  code,
  isDay,
  cloudCover: _cloudCover = 0,
  precip = 0,
  className = "",
  size = "md"
}: AiWeatherIconProps) {
  const getWeatherDetails = () => {
    const effectiveCode = code;
    const isZeroPrecip = precip <= 0.05;

    if (effectiveCode >= 95 && effectiveCode <= 99) {
      return {
        icon: CloudLightning,
        color: "text-purple-300",
        bgGradient: "from-purple-600/30 via-indigo-600/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(168,85,247,0.35)] bg-purple-950/40 border-purple-500/30",
        anim: { scale: [1, 1.12, 1], rotate: [0, -4, 4, 0] },
        duration: 2,
        label: "Burza"
      };
    }
    if (effectiveCode === 45 || effectiveCode === 48) {
      return {
        icon: CloudFog,
        color: "text-zinc-200",
        bgGradient: "from-zinc-500/30 via-slate-600/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(113,113,122,0.25)] bg-zinc-900/40 border-zinc-500/30",
        anim: { opacity: [0.6, 1, 0.6], x: [-4, 4, -4] },
        duration: 3,
        label: "Mgła"
      };
    }
    if ((effectiveCode >= 71 && effectiveCode <= 77) || (effectiveCode >= 85 && effectiveCode <= 86)) {
      return {
        icon: effectiveCode === 71 ? Snowflake : CloudSnow,
        color: "text-sky-200",
        bgGradient: "from-sky-500/30 via-blue-600/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(56,189,248,0.3)] bg-sky-950/40 border-sky-400/30",
        anim: { y: [-6, 6, -6], rotate: [-3, 3, -3] },
        duration: 2.5,
        label: "Śnieg"
      };
    }
    if ((effectiveCode >= 63 && effectiveCode <= 67) || effectiveCode === 82 || (!isZeroPrecip && precip > 1.5)) {
      return {
        icon: CloudRain,
        color: "text-blue-300",
        bgGradient: "from-blue-600/30 via-indigo-700/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(59,130,246,0.35)] bg-blue-950/40 border-blue-500/30",
        anim: { y: [0, 8, 0] },
        duration: 1.5,
        label: "Ulewny deszcz"
      };
    }
    if ((effectiveCode >= 50 && effectiveCode <= 62) || (effectiveCode >= 80 && effectiveCode <= 81) || (!isZeroPrecip && precip > 0.05)) {
      return {
        icon: CloudDrizzle,
        color: "text-cyan-300",
        bgGradient: "from-cyan-500/30 via-blue-600/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(6,182,212,0.3)] bg-cyan-950/40 border-cyan-400/30",
        anim: { y: [0, 4, 0], scale: [1, 1.04, 1] },
        duration: 2,
        label: "Lekki deszcz"
      };
    }
    if (effectiveCode >= 3) {
      return {
        icon: Cloud,
        color: "text-slate-200",
        bgGradient: "from-slate-500/30 via-slate-700/20 to-transparent",
        glow: "shadow-[0_0_35px_rgba(148,163,184,0.25)] bg-slate-900/40 border-slate-600/30",
        anim: { x: [-6, 6, -6] },
        duration: 3.5,
        label: "Pochmurno"
      };
    }
    if (effectiveCode === 2) {
      return {
        icon: isDay ? CloudSun : CloudMoon,
        color: isDay ? "text-amber-200" : "text-indigo-200",
        bgGradient: isDay ? "from-amber-500/30 via-orange-600/15 to-transparent" : "from-indigo-600/30 via-purple-700/15 to-transparent",
        glow: isDay ? "shadow-[0_0_40px_rgba(245,158,11,0.3)] bg-amber-950/30 border-amber-500/30" : "shadow-[0_0_40px_rgba(99,102,241,0.3)] bg-indigo-950/30 border-indigo-500/30",
        anim: { scale: [1, 1.06, 1], rotate: [-3, 3, -3] },
        duration: 3,
        label: "Umiarkowane zachmurzenie"
      };
    }
    if (effectiveCode === 1) {
      return {
        icon: isDay ? CloudSun : CloudMoon,
        color: isDay ? "text-amber-200" : "text-indigo-200",
        bgGradient: isDay ? "from-amber-500/30 via-yellow-600/15 to-transparent" : "from-indigo-600/30 via-purple-700/15 to-transparent",
        glow: isDay ? "shadow-[0_0_40px_rgba(245,158,11,0.25)] bg-amber-950/20 border-amber-500/25" : "shadow-[0_0_40px_rgba(99,102,241,0.25)] bg-indigo-950/20 border-indigo-500/25",
        anim: { scale: [1, 1.04, 1] },
        duration: 3,
        label: "Małe zachmurzenie"
      };
    }
    return {
      icon: isDay ? Sun : Moon,
      color: isDay ? "text-amber-300" : "text-indigo-200",
      bgGradient: isDay ? "from-amber-500/40 via-yellow-500/20 to-transparent" : "from-indigo-500/40 via-purple-600/20 to-transparent",
      glow: isDay ? "shadow-[0_0_50px_rgba(251,191,36,0.35)] bg-gradient-to-br from-amber-500/20 to-amber-900/40 border-amber-400/40" : "shadow-[0_0_50px_rgba(129,140,248,0.35)] bg-gradient-to-br from-indigo-500/20 to-indigo-950/40 border-indigo-400/40",
      anim: isDay ? { rotate: 360, scale: [1, 1.05, 1] } : { scale: [1, 1.08, 1], rotate: [-5, 5, -5] },
      duration: isDay ? 20 : 4,
      label: isDay ? "Słonecznie" : "Bezchmurna noc"
    };
  };

  const details = getWeatherDetails();
  const IconComponent = details.icon;

  if (size !== "lg") {
    return (
      <div className={`relative inline-flex items-center justify-center rounded-xl p-2 ${details.glow} ${className}`}>
        <div className={`flex items-center justify-center ${details.color}`}>
          <IconComponent className="w-full h-full drop-shadow-md" />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center justify-center p-6 rounded-[2.5rem] border backdrop-blur-2xl ${details.glow} ${className} overflow-hidden`}>
      {/* Background radial gradient glow & aura */}
      <div className={`absolute inset-0 bg-gradient-to-br ${details.bgGradient} opacity-70 pointer-events-none`} />
      
      {/* Animated ambient background ring */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-2 rounded-[2rem] border border-white/20 pointer-events-none"
      />

      {/* Floating sparkles for sunshine or magic feel */}
      {isDay && (
        <motion.div
          animate={{ y: [-4, 4, -4], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="absolute top-2 right-3 text-amber-300 pointer-events-none"
        >
          <Sparkles className="w-5 h-5" />
        </motion.div>
      )}

      {/* Main Animated Icon */}
      <motion.div
        className={`flex items-center justify-center ${details.color} relative z-10`}
        animate={details.anim}
        transition={{
          duration: details.duration,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <IconComponent className="w-24 h-24 drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" />
      </motion.div>
    </div>
  );
}

