import React, { useState } from "react";
import { Lock, Send, CheckCircle2, MessageSquareHeart } from "lucide-react";

export default function BetaExpiredScreen() {
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    
    // Save feedback to localStorage so owner can inspect it
    try {
      const existing = JSON.parse(localStorage.getItem("aura_beta_feedback") || "[]");
      existing.push({
        text: feedback.trim(),
        timestamp: new Date().toISOString()
      });
      localStorage.setItem("aura_beta_feedback", JSON.stringify(existing));
    } catch (err) {
      // ignore
    }

    // Optionally open mailto link
    const subject = encodeURIComponent("Feedback Aura Pogoda - Test Beta");
    const body = encodeURIComponent(feedback.trim());
    window.open(`mailto:lukasz8423@gmail.com?subject=${subject}&body=${body}`, '_blank');

    setSubmitted(true);
  };

  return (
    <div className="w-full h-full min-h-[550px] bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md flex flex-col items-center">
        
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-400 shadow-lg">
          <Lock className="w-8 h-8" />
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3 flex items-center gap-2">
          🔒 Koniec testu beta
        </h1>

        {/* Description */}
        <p className="text-slate-300 text-base sm:text-lg mb-2">
          Dziękujemy za przetestowanie Aura Pogoda.
        </p>

        <p className="text-slate-400 text-sm sm:text-base mb-6 leading-relaxed">
          Jeśli znalazłeś błąd lub masz pomysł na poprawę, zostaw feedback.
        </p>

        {/* Feedback Section */}
        {submitted ? (
          <div className="w-full bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 flex items-center gap-3 text-left">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0 text-emerald-400" />
            <p className="text-sm font-medium">
              Dziękujemy za przesłaną opinię! Twoje uwagi pomogą nam ulepszyć aplikację.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="w-full flex flex-col gap-3">
            <div className="relative w-full">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Napisz swoją opinię, zgłoś błąd lub zaproponuj nową funkcję..."
                rows={4}
                className="w-full bg-slate-950/70 border border-slate-700 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 resize-none transition-all"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99]"
            >
              <Send className="w-4 h-4" />
              Wyślij feedback
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-700/60 w-full flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <MessageSquareHeart className="w-3.5 h-3.5 text-amber-500/70" />
          <span>Aura Pogoda &bull; Dziękujemy za udział w testach</span>
        </div>
      </div>
    </div>
  );
}
