import { motion } from "motion/react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface WeatherErrorProps {
  message: string;
  onRetry: () => void;
}

export default function WeatherError({ message, onRetry }: WeatherErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 text-slate-200"
    >
      <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
      <h2 className="text-2xl font-bold mb-2">Coś poszło nie tak</h2>
      <p className="text-slate-400 mb-8 max-w-xs">{message}</p>
      
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-semibold transition-colors"
      >
        <RefreshCw className="w-5 h-5" />
        Spróbuj ponownie
      </button>
    </motion.div>
  );
}
