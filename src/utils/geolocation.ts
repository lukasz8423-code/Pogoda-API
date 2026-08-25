import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

/**
 * High-precision Geolocation Utility for Aura Weather
 * Uses Native GPS (Capacitor) or Browser Geolocation (HTML5 GPS).
 * Strictly avoids IP geolocation fallbacks (which can return remote datacenter coordinates).
 */

export interface DetectedLocation {
  lat: number;
  lng: number;
  cityName?: string;
  accuracy?: number;
  method: "gps_high" | "gps_low" | "cached";
}

/**
 * Sanitizes and validates city names to prevent Chinese, CJK, or weird non-Polish characters.
 */
function isValidCityName(name?: string): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  // Reject CJK / Chinese / Cyrillic characters
  if (/[\u4e00-\u9fff\u3000-\u303f\u0400-\u04ff]/.test(trimmed)) return false;
  return true;
}

export async function detectUserLocation(
  options?: { timeoutMs?: number }
): Promise<DetectedLocation> {
  const timeoutMs = options?.timeoutMs || 15000;

  // Helper: Try Geolocation (Capacitor Native or Browser)
  const getGps = async (highAccuracy: boolean, timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    // 1. Try Capacitor (Native Mobile App)
    if (Capacitor.isNativePlatform()) {
      try {
        console.log("📍 [Geo] Checking Capacitor Native Geolocation permissions...");
        let perm = await Geolocation.checkPermissions();
        console.log("📍 [Geo] Current native location permission state:", JSON.stringify(perm));
        
        if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale' || perm.coarseLocation === 'prompt' || (perm.location !== 'granted' && perm.coarseLocation !== 'granted')) {
          console.log("📍 [Geo] Requesting location permissions from user...");
          perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
          console.log("📍 [Geo] Location permission request result:", JSON.stringify(perm));
        }

        if (perm.location === 'granted' || perm.coarseLocation === 'granted') {
          console.log("📍 [Geo] Native location permission GRANTED! Requesting position...");
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: highAccuracy,
            timeout: timeout,
            maximumAge: highAccuracy ? 0 : 30000
          });
          console.log("📍 [Geo RAW GPS] lat:", pos.coords.latitude, "lng:", pos.coords.longitude, "accuracy:", pos.coords.accuracy);
          return {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
        } else {
          console.warn("⚠️ [Geo] Location permission was not granted by user:", perm.location);
          throw new Error("Dostęp do lokalizacji GPS został odrzucony w ustawieniach systemu Android.");
        }
      } catch (e: any) {
        console.warn("⚠️ [Geo] Capacitor Native Geolocation error:", e);
        throw e;
      }
    }

    // 2. Try Browser Geolocation (HTML5 GPS) with hard JS timeout guarantee
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Geolokalizacja nie jest wspierana przez Twoją przeglądarkę."));
      }

      let finished = false;
      let timer: any = null;

      const finishSuccess = (res: { latitude: number; longitude: number; accuracy: number }) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        resolve(res);
      };

      const finishError = (err: any) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        reject(err);
      };

      // Hard timeout fallback in case browser prompt or iframe blocks callback
      timer = setTimeout(() => {
        finishError(new Error(`Timeout geolokalizacji w przeglądarce (${timeout}ms)`));
      }, timeout + 500);

      console.log("📍 [Geo] Requesting Browser GPS Geolocation...");
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log("📍 [Geo RAW Browser] lat:", pos.coords.latitude, "lng:", pos.coords.longitude, "accuracy:", pos.coords.accuracy);
            finishSuccess({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          (err) => {
            console.warn("⚠️ [Geo Browser Error]", err.code, err.message);
            finishError(err);
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: timeout,
            maximumAge: highAccuracy ? 0 : 30000
          }
        );
      } catch (callErr) {
        finishError(callErr);
      }
    });
  };

  // Helper 2: Reverse Geocode coordinates to human-readable Polish city/village name
  const reverseGeocode = async (lat: number, lng: number): Promise<string | undefined> => {
    // Primary: OpenStreetMap Nominatim with strict 2.5s timeout
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pl`;
      console.log("🔍 [Reverse Geo] Fetching Nominatim:", url);
      const nomController = new AbortController();
      const nomTimeout = setTimeout(() => nomController.abort(), 2500);
      const nomRes = await fetch(url, { signal: nomController.signal });
      clearTimeout(nomTimeout);

      if (nomRes.ok) {
        const nomData = await nomRes.json();
        console.log("🔍 [Geo Nominatim RAW]", JSON.stringify(nomData));
        const a = nomData.address || {};

        // 1. City or Town (e.g., Warszawa, Kraków, Lipno)
        const townOrCity = a.city || a.town;
        // 2. Village or rural settlement
        const villageOrHamlet = a.village || a.hamlet || a.isolated_dwelling || a.locality || a.farm;
        // 3. District / Suburb inside a larger city
        const district = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.allotments || a.residential;
        // 4. Municipality / Gmina
        const municipality = a.municipality || a.district;
        // 5. County / Powiat
        const county = a.county;
        // 6. Voivodeship / State
        const state = a.state;

        if (isValidCityName(townOrCity)) {
          return townOrCity;
        } else if (isValidCityName(villageOrHamlet)) {
          const cleanedMuni = municipality ? municipality.replace(/^gmina\s+/i, '') : null;
          if (cleanedMuni && !cleanedMuni.toLowerCase().includes(villageOrHamlet.toLowerCase())) {
            return `${villageOrHamlet} (gmina ${cleanedMuni})`;
          }
          return villageOrHamlet;
        } else if (isValidCityName(district)) {
          return district;
        } else if (isValidCityName(municipality)) {
          return municipality.toLowerCase().startsWith("gmina") ? municipality : `Gmina ${municipality}`;
        } else if (isValidCityName(county)) {
          return county;
        } else if (isValidCityName(state)) {
          return state;
        }
      }
    } catch (e) {
      console.warn("Client reverse geocode notice (Nominatim):", e);
    }

    // Secondary Fallback: BigDataCloud with 2.5s timeout
    try {
      const bdcController = new AbortController();
      const bdcTimeout = setTimeout(() => bdcController.abort(), 2500);
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pl`,
        { signal: bdcController.signal }
      );
      clearTimeout(bdcTimeout);

      if (res.ok) {
        const data = await res.json();
        
        if (isValidCityName(data.locality) && !data.locality.toLowerCase().startsWith("województwo")) {
          return data.locality;
        }

        const combinedList = [
          ...(data.localityInfo?.administrative || []),
          ...(data.localityInfo?.informative || [])
        ];

        const validItems = combinedList.filter((item: any) => {
          if (!item || !isValidCityName(item.name)) return false;
          const lower = item.name.toLowerCase();
          return !["europa", "europe", "polska", "poland", "unia europejska"].includes(lower) &&
                 !lower.startsWith("województwo") && !lower.startsWith("voivodeship");
        });

        validItems.sort((a: any, b: any) => (b.order || 0) - (a.order || 0));

        if (validItems.length > 0) {
          return validItems[0].name;
        }

        if (isValidCityName(data.city)) {
          return data.city;
        }
      }
    } catch (e) {
      console.warn("Client reverse geocode notice (BigDataCloud):", e);
    }

    return undefined;
  };

  const logDiagnostic = (method: DetectedLocation["method"], lat: number, lng: number, city?: string) => {
    console.log(`📍 [Geo Diagnostic]
      - GPS latitude: ${lat}
      - GPS longitude: ${lng}
      - Źródło lokalizacji: ${method}
      - Wynik reverse geocoding: ${city || "Brak / Nieokreślono"}
      - Współrzędne użyte do Open-Meteo: lat=${lat}, lng=${lng}`);
  };

  // Step 1: Try High Accuracy GPS
  try {
    console.log("📍 [Geo] Stage 1: Requesting High Accuracy GPS...");
    const pos = await getGps(true, Math.min(timeoutMs, 6000));
    const { latitude: lat, longitude: lng } = pos;
    const accuracy = Math.round(pos.accuracy);
    const cityName = await reverseGeocode(lat, lng);

    logDiagnostic("gps_high", lat, lng, cityName);

    return {
      lat,
      lng,
      cityName,
      accuracy,
      method: "gps_high"
    };
  } catch (err) {
    console.warn("⚠️ [Geo] Stage 1 High Accuracy GPS failed or timed out:", err);
  }

  // Step 2: Try Standard GPS
  try {
    console.log("📍 [Geo] Stage 2: Requesting Standard Accuracy GPS...");
    const pos = await getGps(false, 4000);
    const { latitude: lat, longitude: lng } = pos;
    const accuracy = Math.round(pos.accuracy);
    const cityName = await reverseGeocode(lat, lng);

    logDiagnostic("gps_low", lat, lng, cityName);

    return {
      lat,
      lng,
      cityName,
      accuracy,
      method: "gps_low"
    };
  } catch (err: any) {
    console.warn("⚠️ [Geo] Stage 2 GPS failed or timed out:", err);
    if (err?.message && err.message.includes("odrzucony")) {
      throw err;
    }
  }

  // Strictly avoid IP geolocation guessing (which returns ISP datacenter locations like Gdańsk or Łódź)
  console.warn("⚠️ [Geo] GPS detection unavailable or denied by user.");
  throw new Error("Lokalizacja GPS jest wyłączona lub brak do niej uprawnień w ustawieniach telefonu. Wybierz miejscowość z listy poniżej lub wpisz w wyszukiwarce.");
}

