import { LucideIcon } from "lucide-react";
import { motion, TargetAndTransition } from "motion/react";

interface AnimatedWeatherIconProps {
  icon: LucideIcon;
  className?: string;
  animationType?: "rotate" | "float" | "drop" | "pulse";
  isDay?: boolean;
}

export default function AnimatedWeatherIcon({ 
  icon: Icon, 
  className = "", 
  animationType = "float",
  isDay = true
}: AnimatedWeatherIconProps) {
  
  const variants: Record<string, TargetAndTransition> = {
    rotate: { rotate: 360, transition: { duration: 12, repeat: Infinity, ease: "linear" } },
    float: { y: [0, -6, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    drop: { y: [0, 8, 0], opacity: [0.8, 1, 0.8], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
    pulse: { scale: [1, 1.05, 1], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } }
  };

  return (
    <motion.div
      className={`${className} ${isDay ? "opacity-100" : "opacity-60"}`}
      animate={variants[animationType]}
    >
      <Icon className="w-full h-full" />
    </motion.div>
  );
}
