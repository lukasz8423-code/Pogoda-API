import { useState, useEffect } from "react";
import { Download, X, Smartphone, ShieldCheck, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    // If we are inside AI Studio iframe (aistudio.google.com), prompt user to open in new tab first
    if (window.location.hostname.includes('aistudio.google.com')) {
      setShowIOSModal(true);
      return;
    }

    if (isIOS || !deferredPrompt) {
      setShowIOSModal(true);
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        console.log("User accepted the install prompt");
        setShowPrompt(false);
      }
    } catch (err) {
      console.error("Install prompt error:", err);
      setShowIOSModal(true);
    }
  };

  const openInNewTab = () => {
    // If running in playground iframe, we can open the share preview URL or current window in new tab
    const previewUrl = window.location.href.includes('aistudio.google.com') 
      ? window.location.href.replace('aistudio.google.com', 'ais-pre-55vkqchaiz5cdsnzrutx6d-128716608243.europe-west2.run.app') // fallback
      : window.location.href;
    window.open(window.location.origin, '_blank');
  };

  return (
    <>
      {/* Floating or Banner Install Prompt */}
      <AnimatePresence>
        {(showPrompt || isIOS) && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-slate-900/95 border border-blue-500/30 rounded-3xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            id="pwa-install-banner"
          >
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-blue-500/15 border border-blue-500/20 rounded-2xl text-blue-400 shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-slate-100">Aura Pogoda PWA</h4>
                  <button
                    onClick={() => setShowPrompt(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-full transition-colors"
                    id="btn-close-pwa-banner"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Zainstaluj aplikację na telefonie, aby mieć bezpośredni dostęp do prognozy pogody bez otwierania przeglądarki.
                </p>
                <div className="mt-3 flex items-center space-x-2">
                  <button
                    onClick={handleInstallClick}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-all active:scale-98 shadow-md"
                    id="btn-install-pwa-action"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Zainstaluj aplikację</span>
                  </button>
                  <button
                    onClick={() => setShowPrompt(false)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors font-medium"
                  >
                    Później
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Installation Guide & New Tab Warning Modal */}
      <AnimatePresence>
        {showIOSModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowIOSModal(false)}
            className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700/80 rounded-[28px] p-5 w-full max-w-[360px] shadow-2xl relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-xs text-slate-100">Instalacja aplikacji Aura Pogoda</h3>
                </div>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-[11px] leading-relaxed">
                  <strong>Dlaczego widzisz panel AI Studio?</strong>
                  <p className="mt-1">
                    Zainstalowałeś aplikację będąc w edytorze AI Studio. Aby zainstalować samą aplikację pogodową, musisz otworzyć poniższy link podglądu w nowej karcie i dopiero tam kliknąć „Zainstaluj”!
                  </p>
                </div>

                <button
                  onClick={() => {
                    const shareUrl = "https://ais-pre-55vkqchaiz5cdsnzrutx6d-128716608243.europe-west2.run.app";
                    window.open(shareUrl, '_blank');
                  }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg transition-all animate-pulse"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Otwórz Czystą Aplikację w Nowej Karcie</span>
                </button>

                {isIOS ? (
                  <>
                    <p className="font-medium text-slate-200 mt-2">Na telefonie iPhone (Safari):</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
                      <li>Otwórz link w nowej karcie Safari.</li>
                      <li>Stuknij ikonę <strong>Udostępnij</strong> na dolnym pasku.</li>
                      <li>Wybierz <strong className="text-blue-400">„Do ekranu początkowego”</strong>.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-slate-200 mt-2">Na telefonie z Androidem (Chrome):</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                      <li>Otwórz aplikację w nowej karcie przeglądarki.</li>
                      <li>Kliknij menu (trzy kropki w prawym górnym rogu).</li>
                      <li>Wybierz <strong className="text-blue-400">„Zainstaluj aplikację”</strong> lub <strong className="text-blue-400">„Dodaj do ekranu głównego”</strong>.</li>
                    </ul>
                  </>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
                >
                  Zamknij okno
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
