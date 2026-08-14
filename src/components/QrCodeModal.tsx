import { motion, AnimatePresence } from "motion/react";
import { X, QrCode, Copy, Check, ExternalLink, RefreshCw, Link as LinkIcon } from "lucide-react";
import { useState, useEffect } from "react";
import QRCode from "react-qr-code";

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QrCodeModal({ isOpen, onClose }: QrCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const getPublicPreUrl = () => {
    if (typeof window === "undefined") return "https://ais-pre-55vkqchaiz5cdsnzrutx6d-128716608243.europe-west2.run.app";
    const origin = window.location.origin;
    if (origin.includes("-dev-")) {
      return origin.replace("-dev-", "-pre-");
    }
    if (origin.includes("ai.studio")) {
      return "https://ais-pre-55vkqchaiz5cdsnzrutx6d-128716608243.europe-west2.run.app";
    }
    return origin;
  };
  const defaultPreUrl = getPublicPreUrl();
  const [appUrl, setAppUrl] = useState(defaultPreUrl);
  const [customUrl, setCustomUrl] = useState(defaultPreUrl);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const origin = getPublicPreUrl();
    setAppUrl(origin);
    setCustomUrl(origin);
  }, []);

  const activeUrl = customUrl.trim() || appUrl || defaultPreUrl;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activeUrl)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy url: ", err);
    }
  };

  // Ensure QRCode component safety for React 19 / ES module interop
  const QRCodeComp = (QRCode as any)?.default || QRCode;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - Completely transparent overlay so background remains 100% bright and clear */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4 select-none"
          >
            {/* Modal Dialog */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/95 border border-slate-700/80 rounded-[28px] p-5 w-full max-w-[340px] shadow-[0_15px_40px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-xl"
              id="qr-code-modal"
            >
              {/* Decorative Subtle Light Orbs */}
              <div className="absolute -top-12 -left-12 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
              <div className="absolute -bottom-12 -right-12 w-28 h-28 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none"></div>

              {/* Header */}
              <div className="flex justify-between items-center mb-3 relative z-10">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm tracking-wide text-slate-100">
                    Link PWA do udostępnienia
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                  id="btn-close-qr-modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Notice badge about clean PWA without chat/editor */}
              <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/25 rounded-xl text-[11px] text-blue-200 leading-tight">
                ✨ Czysty link do aplikacji pogodowej (bez panelu AI i czatu), idealny dla bliskich!
              </div>

              {/* QR Code Canvas Frame - Dual engine for 100% reliable rendering */}
              <div className="flex flex-col items-center justify-center space-y-3 relative z-10">
                <div className="p-3 bg-white border border-slate-200 rounded-3xl shadow-lg flex items-center justify-center select-none min-w-[170px] min-h-[170px]">
                  {!imgError ? (
                    <img
                      src={qrApiUrl}
                      alt="Kod QR Aplikacji PWA"
                      className="w-40 h-40 object-contain rounded-xl"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center">
                      {typeof QRCodeComp === "function" ? (
                        <QRCodeComp
                          size={160}
                          value={activeUrl}
                          fgColor="#020617"
                          bgColor="#ffffff"
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        />
                      ) : (
                        <div className="text-xs text-slate-800 font-mono text-center p-2">
                          Błąd generowania
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center space-y-0.5 px-1">
                  <p className="text-xs font-semibold text-slate-200">Zeskanuj telefonem</p>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Otwórz bezpośrednio na urządzeniu mobilnym jako aplikację PWA.
                  </p>
                </div>

                {/* Editable Link Input */}
                <div className="w-full relative mt-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <LinkIcon className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => {
                      setCustomUrl(e.target.value);
                      setImgError(false);
                    }}
                    placeholder="Adres URL PWA..."
                    className="w-full pl-8 pr-16 py-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  {customUrl !== appUrl && (
                    <button
                      onClick={() => {
                        setCustomUrl(appUrl);
                        setImgError(false);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-1 bg-blue-500/10 rounded-lg flex items-center space-x-1"
                      title="Przywróć domyślny URL"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div className="w-full space-y-2 pt-1">
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all active:scale-98"
                    id="btn-copy-app-link"
                  >
                    <span className="truncate max-w-[200px] text-slate-400 font-mono text-[11px]">
                      {activeUrl}
                    </span>
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 shrink-0 ml-1.5" />
                    )}
                  </button>

                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center space-x-1.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-all active:scale-98 shadow-md"
                    id="btn-open-external-tab"
                  >
                    <span>Otwórz PWA w nowej karcie</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
