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
  method: "gps_high" | "gps_low" | "cached" | "fallback";
}

/**
 * Validates whether GPS coordinates fall within the geographical boundary of Poland.
 * Poland latitude bounds: 48.0 - 56.0
 * Poland longitude bounds: 13.0 - 25.5
 */
export function isPolandCoordinates(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= 48.0 &&
    lat <= 56.0 &&
    lng >= 13.0 &&
    lng <= 25.5
  );
}

/**
 * Sanitizes and validates city names to prevent invalid labels or non-Polish characters.
 */
export function isValidCityName(name?: string): boolean {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "nieznana lokalizacja" ||
    lower === "lokalizacja nie ma żadnej nazwy" ||
    lower === "lokalizacja bez nazwy" ||
    lower === "brak nazwy" ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "lokalizacja" ||
    lower === "polska" ||
    lower === "poland" ||
    lower === "europe" ||
    lower === "europa" ||
    lower === "unia europejska"
  ) {
    return false;
  }
  // Reject CJK / Chinese / Cyrillic characters
  if (/[\u4e00-\u9fff\u3000-\u303f\u0400-\u04ff]/.test(trimmed)) return false;
  return true;
}

/**
 * Helper: Reverse Geocode coordinates to human-readable Polish city/village name.
 * Uses Nominatim as primary and BigDataCloud as secondary fallback.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  // If coordinates are clearly outside Poland, do not reverse geocode
  if (!isPolandCoordinates(lat, lng)) {
    return undefined;
  }

  // 1. Primary: OpenStreetMap Nominatim with strict 2.5s timeout
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pl`;
    const nomController = new AbortController();
    const nomTimeout = setTimeout(() => nomController.abort(), 2500);
    const nomRes = await fetch(url, {
      headers: { 'Accept-Language': 'pl' },
      signal: nomController.signal
    });
    clearTimeout(nomTimeout);

    if (nomRes.ok) {
      const nomData = await nomRes.json();
      const a = nomData.address || {};

      const cityCandidate = a.city;
      const townCandidate = a.town;
      const villageCandidate = a.village || a.hamlet || a.isolated_dwelling;
      const municipalityCandidate = a.municipality || a.district;
      const countyCandidate = a.county;
      const stateCandidate = a.state;
      const otherCandidate = a.suburb || a.locality || a.neighbourhood || a.quarter || a.city_district || a.residential;

      if (isValidCityName(cityCandidate)) return cityCandidate.trim();
      if (isValidCityName(townCandidate)) return townCandidate.trim();
      if (isValidCityName(villageCandidate)) return villageCandidate.trim();
      if (isValidCityName(municipalityCandidate)) {
        return municipalityCandidate.toLowerCase().startsWith("gmina") ? municipalityCandidate.trim() : `Gmina ${municipalityCandidate.trim()}`;
      }
      if (isValidCityName(countyCandidate)) return countyCandidate.trim();
      if (isValidCityName(stateCandidate)) return stateCandidate.trim();
      if (isValidCityName(otherCandidate)) return otherCandidate.trim();
    }
  } catch (e) {
    console.warn("Client reverse geocode notice (Nominatim):", e);
  }

  // 2. Secondary Fallback: BigDataCloud with 2.5s timeout
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
      if (isValidCityName(data.city)) return data.city.trim();
      if (isValidCityName(data.locality) && !data.locality.toLowerCase().startsWith("województwo")) return data.locality.trim();

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
        return validItems[0].name.trim();
      }
    }
  } catch (e) {
    console.warn("Client reverse geocode notice (BigDataCloud):", e);
  }

  // Fallback for Lipno area
  if (Math.abs(lat - 52.8441) < 0.05 && Math.abs(lng - 19.1772) < 0.05) {
    return "Lipno";
  }

  return undefined;
}

/**
 * Returns the user's last valid location in Poland from localStorage,
 * or safely falls back to Lipno (52.8441, 19.1772).
 */
export async function getLastValidLocationOrFallback(): Promise<DetectedLocation> {
  // 1. Check for last valid saved coordinates in localStorage
  try {
    const savedCoordsStr = localStorage.getItem("aura_last_coords");
    const savedCityStr = localStorage.getItem("aura_last_city");
    if (savedCoordsStr) {
      const parsed = JSON.parse(savedCoordsStr);
      if (
        parsed &&
        typeof parsed.lat === "number" &&
        typeof parsed.lng === "number" &&
        !isNaN(parsed.lat) &&
        !isNaN(parsed.lng) &&
        isPolandCoordinates(parsed.lat, parsed.lng)
      ) {
        console.log(`📍 [Geo] Użyto ostatniej prawidłowej lokalizacji: lat=${parsed.lat}, lng=${parsed.lng}${savedCityStr ? `, miasto=${savedCityStr}` : ""}`);
        let city = isValidCityName(savedCityStr || undefined) ? savedCityStr!.trim() : undefined;
        if (!city) {
          city = await reverseGeocode(parsed.lat, parsed.lng);
          console.log(`📍 [Geo] Wynik reverse geocodingu: ${city || "brak"}`);
        }
        const finalCity = city || "Poprzednia lokalizacja";
        console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=${parsed.lat}, lng=${parsed.lng}, miasto=${finalCity}`);
        return {
          lat: parsed.lat,
          lng: parsed.lng,
          cityName: finalCity,
          method: "cached"
        };
      }
    }
  } catch (e) {
    console.warn("Error reading last valid location from storage:", e);
  }

  // 2. Safe Fallback: Lipno (52.8441, 19.1772)
  console.log("📍 [Geo] Użyto fallbacku Lipno: lat=52.8441, lng=19.1772");
  let city = await reverseGeocode(52.8441, 19.1772);
  console.log(`📍 [Geo] Wynik reverse geocodingu: ${city || "Lipno"}`);
  const finalCity = city || "Lipno";
  console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=52.8441, lng=19.1772, miasto=${finalCity}`);
  return {
    lat: 52.8441,
    lng: 19.1772,
    cityName: finalCity,
    method: "fallback"
  };
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

      const geoOptions: PositionOptions = {
        enableHighAccuracy: highAccuracy,
        timeout: timeout,
        maximumAge: 0 // Always enforce maximumAge: 0 to prevent browser from returning stale cached positions
      };

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            finishSuccess({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          (err) => {
            finishError(err);
          },
          geoOptions
        );
      } catch (callErr) {
        finishError(callErr);
      }
    });
  };

  let foundGpsLat: number | null = null;
  let foundGpsLng: number | null = null;
  let foundGpsAccuracy: number | null = null;
  let isGpsOutsidePoland = false;

  // Step 1: Try High Accuracy GPS
  try {
    console.log("📍 [Geo] Stage 1: Requesting High Accuracy GPS...");
    const pos = await getGps(true, Math.min(timeoutMs, 6000));
    const { latitude: lat, longitude: lng } = pos;
    const accuracy = Math.round(pos.accuracy);

    console.log(`📍 [Geo] Wykryto GPS: lat=${lat}, lng=${lng}, dokładność=${accuracy}m`);

    if (!isPolandCoordinates(lat, lng)) {
      console.warn(`🚨 [Geo] GPS odrzucony jako poza Polską: lat=${lat}, lng=${lng}`);
      isGpsOutsidePoland = true;
    } else {
      foundGpsLat = lat;
      foundGpsLng = lng;
      foundGpsAccuracy = accuracy;
    }
  } catch (err) {
    console.warn("⚠️ [Geo] Stage 1 High Accuracy GPS failed or timed out:", err);
  }

  // Step 2: Try Standard GPS if Stage 1 didn't find valid Poland coordinates
  if (foundGpsLat === null && !isGpsOutsidePoland) {
    try {
      console.log("📍 [Geo] Stage 2: Requesting Standard Accuracy GPS...");
      const pos = await getGps(false, 4000);
      const { latitude: lat, longitude: lng } = pos;
      const accuracy = Math.round(pos.accuracy);

      console.log(`📍 [Geo] Wykryto GPS: lat=${lat}, lng=${lng}, dokładność=${accuracy}m`);

      if (!isPolandCoordinates(lat, lng)) {
        console.warn(`🚨 [Geo] GPS odrzucony jako poza Polską: lat=${lat}, lng=${lng}`);
        isGpsOutsidePoland = true;
      } else {
        foundGpsLat = lat;
        foundGpsLng = lng;
        foundGpsAccuracy = accuracy;
      }
    } catch (err: any) {
      console.warn("⚠️ [Geo] Stage 2 GPS failed or timed out:", err);
    }
  }

  // If we found valid GPS coordinates inside Poland:
  if (foundGpsLat !== null && foundGpsLng !== null) {
    const lat = foundGpsLat;
    const lng = foundGpsLng;
    const accuracy = foundGpsAccuracy ?? 10;
    const geoCity = await reverseGeocode(lat, lng);
    console.log(`📍 [Geo] Wynik reverse geocodingu: ${geoCity || "brak"}`);
    const finalCity = geoCity || "Lokalizacja GPS";
    console.log(`📍 [Geo] Finalna lokalizacja użyta przez aplikację: lat=${lat}, lng=${lng}, miasto=${finalCity}`);

    return {
      lat,
      lng,
      cityName: finalCity,
      accuracy,
      method: "gps_high"
    };
  }

  // If GPS was rejected as outside Poland OR failed/timed out:
  // Activate clean fallback to last valid location or Lipno
  return await getLastValidLocationOrFallback();
}

