import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, X } from "lucide-react";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // CRITICAL: On Native Android APK / iOS Capacitor, NEVER render PWA install prompt!
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (!isVisible || (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform())) {
    return null;
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA Install] User choice: ${outcome}`);
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-slate-900/95 border border-blue-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-center justify-between space-x-3 text-white">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-blue-600/20 border border-blue-400/30 rounded-xl text-blue-400 shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold">Zainstaluj Aura Pogoda (PWA)</h4>
          <p className="text-[10px] text-slate-400">Dodaj do ekranu głównego dla szybszego dostępu</p>
        </div>
      </div>
      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={handleInstallClick}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow transition-all"
        >
          Zainstaluj
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          title="Zamknij"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
