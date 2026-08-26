import { useState, useCallback } from "react";

export function useCameraLightMeter() {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const measureLux = useCallback(async (): Promise<number | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Przeglądarka lub środowisko iframe ogranicza dostęp do MediaDevices (Aparat).");
      return null;
    }

    setIsMeasuring(true);
    setError(null);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 } } 
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      let video, canvas;
      try {
        video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.setAttribute("muted", "true");
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;

        await video.play().catch(pErr => console.warn("Video play warning:", pErr));

        canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
      } catch (domErr) {
        console.warn("DOM manipulation (video/canvas) failed:", domErr);
        stream.getTracks().forEach(track => track.stop());
        setIsMeasuring(false);
        setError("Błąd inicjalizacji czujnika światła.");
        return null;
      }

      const ctx = canvas.getContext("2d");

      return new Promise((resolve) => {
        setTimeout(() => {
          let approxLux = null;
          if (ctx && video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, 100, 100);
            const imageData = ctx.getImageData(0, 0, 100, 100);
            let totalLuminance = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
              const r = imageData.data[i];
              const g = imageData.data[i + 1];
              const b = imageData.data[i + 2];
              totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
            }
            const avgLuminance = totalLuminance / (100 * 100);
            approxLux = Math.round(Math.pow(avgLuminance / 255, 2) * 10000 + 15);
          } else {
            approxLux = 350;
          }

          stream.getTracks().forEach(track => track.stop());
          setIsMeasuring(false);
          resolve(approxLux);
        }, 1500);
      });
    } catch (err: any) {
      setIsMeasuring(false);
      console.warn("Camera lux measurement error:", err);
      setError(`Nie udało się połączyć z aparatem (${err.message || "Błąd"}).`);
      return null;
    }
  }, []);

  return { measureLux, isMeasuring, error };
}
