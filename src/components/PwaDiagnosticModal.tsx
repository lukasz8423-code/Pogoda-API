import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Smartphone, Sun, Camera, ShieldAlert, CheckCircle2, Info, Compass, HelpCircle, MapPin } from "lucide-react";

export interface GeoDiagnosticInfo {
  lat: number;
  lng: number;
  cityName?: string;
  method?: string;
  accuracy?: number;
  timestamp?: string;
  weatherCoordsUsed?: { lat: number; lng: number };
}

interface PwaDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  measurementLocation: "indoor" | "outdoor";
  onToggleLocation: (loc: "indoor" | "outdoor") => void;
  onTriggerCameraLux: () => void;
  cameraFacingMode?: "environment" | "user";
  onToggleCameraFacing?: () => void;
  geoDiagnostic?: GeoDiagnosticInfo | null;
}

export default function PwaDiagnosticModal({
  isOpen,
  onClose,
  measurementLocation,
  onToggleLocation,
  onTriggerCameraLux,
  cameraFacingMode = "environment",
  onToggleCameraFacing,
  geoDiagnostic,
}: PwaDiagnosticModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl text-slate-100 relative"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-2xl text-blue-400">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">
                Diagnostyka Aplikacji Android (APK) & GPS
              </h3>
              <p className="text-xs text-slate-400">
                Współrzędne GPS, Reverse Geocoding, Aparat & Kalibracja
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-300">
            {/* GPS & Location Diagnostics Card */}
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-emerald-200 text-sm">Diagnostyka GPS & Geolokalizacji</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  {geoDiagnostic?.method || "GPS / Auto"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">Szerokość GPS (Lat):</span>
                  <span className="text-emerald-300 font-bold">{geoDiagnostic?.lat ?? "Brak"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Długość GPS (Lng):</span>
                  <span className="text-emerald-300 font-bold">{geoDiagnostic?.lng ?? "Brak"}</span>
                </div>
                <div className="sm:col-span-2 border-t border-slate-800/80 pt-1.5 mt-0.5">
                  <span className="text-slate-400 block text-[10px]">Nazwa z Reverse Geocoding:</span>
                  <span className="text-white font-bold text-xs">{geoDiagnostic?.cityName || "Nieznana lokalizacja"}</span>
                </div>
                <div className="sm:col-span-2 border-t border-slate-800/80 pt-1.5">
                  <span className="text-slate-400 block text-[10px]">Współrzędne zapytania Open-Meteo:</span>
                  <span className="text-cyan-300 font-bold">
                    lat={geoDiagnostic?.weatherCoordsUsed?.lat ?? geoDiagnostic?.lat ?? "—"}, lng={geoDiagnostic?.weatherCoordsUsed?.lng ?? geoDiagnostic?.lng ?? "—"}
                  </span>
                </div>
                {geoDiagnostic?.accuracy !== undefined && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Dokładność sygnału:</span>
                    <span className="text-slate-300">± {geoDiagnostic.accuracy}m</span>
                  </div>
                )}
                {geoDiagnostic?.timestamp && (
                  <div>
                    <span className="text-slate-400 block text-[10px]">Czas odczytu:</span>
                    <span className="text-slate-300">{new Date(geoDiagnostic.timestamp).toLocaleTimeString("pl-PL")}</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-emerald-300/80 leading-snug">
                ✓ Pogoda z Open-Meteo jest pobierana dokładnie dla powyższych współrzędnych GPS.
              </p>
            </div>
            {/* Quick Location & Camera Selection Controls */}
            <div className="p-4 bg-blue-950/40 border border-blue-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-200">Gdzie obecnie wykonujesz pomiar?</span>
                <span className="text-[10px] text-blue-400 font-mono">Tryb przeliczenia Lux</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onToggleLocation("indoor")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                    measurementLocation === "indoor"
                      ? "bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold shadow-md"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <span className="text-base mb-1">🏠</span>
                  <span className="text-xs">Wewnątrz (Za szybą)</span>
                  <span className="text-[9px] opacity-75 mt-0.5">Automatyczna korekta tłumienia szyby</span>
                </button>

                <button
                  onClick={() => onToggleLocation("outdoor")}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                    measurementLocation === "outdoor"
                      ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-bold shadow-md"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <span className="text-base mb-1">☀️</span>
                  <span className="text-xs">Na zewnątrz (Plener)</span>
                  <span className="text-[9px] opacity-75 mt-0.5">Bezpośredni promień nieba</span>
                </button>
              </div>

              {/* Camera Facing Selector */}
              {onToggleCameraFacing && (
                <div className="flex items-center justify-between p-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl">
                  <span className="text-slate-300 text-[11px]">
                    Używany aparat: <strong>{cameraFacingMode === "environment" ? "📷 Tylny (Główny - do nieba)" : "🤳 Przedni (Selfie)"}</strong>
                  </span>
                  <button
                    onClick={onToggleCameraFacing}
                    className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400/40 rounded-lg text-blue-200 text-[10px] font-bold transition-all"
                  >
                    Przełącz na {cameraFacingMode === "environment" ? "Przedni 🤳" : "Tylny 📷"}
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  onClose();
                  onTriggerCameraLux();
                }}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl flex items-center justify-center space-x-2 shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Uruchom pomiar jasności nieba aparatem</span>
              </button>
            </div>

            {/* Kalibracja Lux */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                <Info className="w-4 h-4 text-amber-400" />
                <span>Kalibracja pomiarów Lux & Aparat:</span>
              </h4>

              <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl space-y-1">
                <p className="font-bold text-amber-300">1. Przełącznik Wewnątrz / Zewnątrz</p>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Szyby w okno i rolety wycinają 80-88% światła nieba! Przełączanie trybu <strong>"Za szybą (Wewnątrz)"</strong> automatycznie stosuje wzór przeliczeniowy – gdy w pokoju aparat wykryje np. 800 Lux, aplikacja przelicza to na ekwiwalent ~12 000 Lux nieba na zewnątrz.
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl space-y-1">
                <p className="font-bold text-cyan-300">2. Wybór aparatu</p>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Domyślnie funkcja wymusza <strong>Tylny aparat główny (Environment Camera)</strong>, skierowany w niebo. Jeśli masz podłączony aparat selfie, możesz kliknąć <em>"Przełącz aparat"</em> powyżej.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 text-center">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold text-xs text-white transition-all cursor-pointer"
            >
              Rozumiem, zamknij
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
