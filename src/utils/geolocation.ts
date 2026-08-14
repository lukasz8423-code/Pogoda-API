import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

/**
 * High-precision Geolocation Utility for Aura Weather
 * Combines Browser GPS (High Accuracy & Low Accuracy) with automatic IP Geolocation fallback
 * to ensure location detection NEVER fails even inside iframes or when GPS permissions are denied/blocked.
 */

export interface DetectedLocation {
  lat: number;
  lng: number;
  cityName?: string;
  accuracy?: number;
  method: "gps_high" | "gps_low" | "ip" | "cached" | "fallback";
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

/**
 * Ensures latitude and longitude are not swapped.
 * For Poland: lat is ~49-55, lng is ~14-24.
 */
function fixCoordinatesIfNeeded(lat: number, lng: number): { lat: number; lng: number } {
  if (lat > 14 && lat < 25 && lng > 49 && lng < 56) {
    console.warn("⚠️ [Geo] Coordinates appeared inverted (lat/lng swapped). Swapping:", { lat, lng });
    return { lat: lng, lng: lat };
  }
  return { lat, lng };
}

export async function detectUserLocation(
  options?: { timeoutMs?: number }
): Promise<DetectedLocation> {
  const timeoutMs = options?.timeoutMs || 8000;

  // Helper 1: Try Geolocation (Capacitor or Browser)
  const getGps = async (highAccuracy: boolean, timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    // 1. Try Capacitor (Native)
    if (Capacitor.isNativePlatform()) {
      try {
        console.log("📍 [Geo] Using Capacitor Native Geolocation plugin...");
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: highAccuracy,
          timeout: timeout,
          maximumAge: highAccuracy ? 0 : 300000
        });
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
      } catch (e) {
        console.warn("⚠️ [Geo] Capacitor Native Geolocation failed, trying browser fallback...", e);
      }
    }

    // 2. Try Browser Geolocation
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Browser geolocation not supported"));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        reject,
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeout,
          maximumAge: highAccuracy ? 0 : 300000
        }
      );
    });
  };

  // Helper 2: Reverse Geocode coordinates to human-readable city name
  const reverseGeocode = async (rawLat: number, rawLng: number): Promise<string | undefined> => {
    const { lat, lng } = fixCoordinatesIfNeeded(rawLat, rawLng);

    // Primary: OpenStreetMap Nominatim (High Precision for Polish Villages & Settlements)
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pl`
      );
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const a = nomData.address || {};
        
        // 1. City or Town (e.g., Warszawa, Kraków, Płock)
        const townOrCity = a.city || a.town;
        // 2. Village or rural settlement (e.g., Lipno, Tomaszewo, Słupia)
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
      console.warn("Client reverse geocode error (Nominatim):", e);
    }

    // Secondary Fallback: BigDataCloud (Highest Order Locality First)
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pl`
      );
      if (res.ok) {
        const data = await res.json();
        
        // Prefer explicit locality
        if (isValidCityName(data.locality) && !data.locality.toLowerCase().startsWith("województwo")) {
          return data.locality;
        }

        // Search localityInfo administrative & informative arrays sorted by highest order (e.g. 10 = village, 8 = gmina)
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

        // Sort by order DESCENDING (10 = village/sołectwo, 8 = gmina, 6 = powiat)
        validItems.sort((a: any, b: any) => (b.order || 0) - (a.order || 0));

        if (validItems.length > 0) {
          return validItems[0].name;
        }

        if (isValidCityName(data.city)) {
          return data.city;
        }
      }
    } catch (e) {
      console.warn("Client reverse geocode error (BigDataCloud):", e);
    }

    return undefined;
  };

  const logDiagnostic = (method: DetectedLocation["method"], lat: number, lng: number, city?: string) => {
    console.log(`📍 [Geo Diagnostic]
      - GPS latitude: ${lat}
      - GPS longitude: ${lng}
      - Źródło lokalizacji: ${method}
      - Wynik reverse geocoding: ${city || "Brak / Nieokreślono"}
      - Współrzędne faktycznie użyte do Open-Meteo: lat=${lat}, lng=${lng}`);
  };

  // Step 1: High Accuracy GPS
  try {
    console.log("📍 [Geo] Stage 1: Requesting High Accuracy GPS...");
    const pos = await getGps(true, Math.min(timeoutMs, 6000));
    const fixed = fixCoordinatesIfNeeded(pos.latitude, pos.longitude);
    const accuracy = Math.round(pos.accuracy);
    const cityName = await reverseGeocode(fixed.lat, fixed.lng);

    logDiagnostic("gps_high", fixed.lat, fixed.lng, cityName);

    return {
      lat: fixed.lat,
      lng: fixed.lng,
      cityName,
      accuracy,
      method: "gps_high"
    };
  } catch (err) {
    console.warn("⚠️ [Geo] Stage 1 High Accuracy GPS failed or timed out:", err);
  }

  // Step 2: Low Accuracy GPS (Network / Cell Tower)
  try {
    console.log("📍 [Geo] Stage 2: Requesting Low Accuracy Network GPS...");
    const pos = await getGps(false, 5000);
    const fixed = fixCoordinatesIfNeeded(pos.latitude, pos.longitude);
    const accuracy = Math.round(pos.accuracy);
    const cityName = await reverseGeocode(fixed.lat, fixed.lng);

    logDiagnostic("gps_low", fixed.lat, fixed.lng, cityName);

    return {
      lat: fixed.lat,
      lng: fixed.lng,
      cityName,
      accuracy,
      method: "gps_low"
    };
  } catch (err) {
    console.warn("⚠️ [Geo] Stage 2 Low Accuracy GPS failed or timed out:", err);
  }

  // Step 3: IP Geolocation (GeoJS)
  try {
    console.log("📍 [Geo] Stage 3: Requesting IP Geolocation fallback...");
    const ipRes = await fetch("https://get.geojs.io/v1/ip/geo.json");
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      let rawLat = parseFloat(ipData.latitude);
      let rawLng = parseFloat(ipData.longitude);
      if (!isNaN(rawLat) && !isNaN(rawLng) && (rawLat !== 0 || rawLng !== 0)) {
        const fixed = fixCoordinatesIfNeeded(rawLat, rawLng);
        let cityName = isValidCityName(ipData.city) ? ipData.city : undefined;
        if (!cityName) cityName = await reverseGeocode(fixed.lat, fixed.lng);

        logDiagnostic("ip", fixed.lat, fixed.lng, cityName);

        return {
          lat: fixed.lat,
          lng: fixed.lng,
          cityName,
          accuracy: 10000,
          method: "ip"
        };
      }
    }
  } catch (err) {
    console.warn("⚠️ [Geo] Stage 3 IP Geolocation (GeoJS) failed:", err);
  }

  // Step 4: Backup IP Provider (ipapi.co)
  try {
    const ipRes2 = await fetch("https://ipapi.co/json/");
    if (ipRes2.ok) {
      const ipData = await ipRes2.json();
      let rawLat = parseFloat(ipData.latitude);
      let rawLng = parseFloat(ipData.longitude);
      if (!isNaN(rawLat) && !isNaN(rawLng) && (rawLat !== 0 || rawLng !== 0)) {
        const fixed = fixCoordinatesIfNeeded(rawLat, rawLng);
        let cityName = isValidCityName(ipData.city) ? ipData.city : undefined;
        if (!cityName) cityName = await reverseGeocode(fixed.lat, fixed.lng);

        logDiagnostic("ip", fixed.lat, fixed.lng, cityName);

        return {
          lat: fixed.lat,
          lng: fixed.lng,
          cityName,
          accuracy: 15000,
          method: "ip"
        };
      }
    }
  } catch (err) {
    console.warn("⚠️ [Geo] Backup IP Geolocation failed:", err);
  }

  // Step 5: Check localStorage cache
  try {
    const savedCoordsStr = localStorage.getItem("aura_last_coords");
    const savedCity = localStorage.getItem("aura_last_city");
    if (savedCoordsStr) {
      const parsed = JSON.parse(savedCoordsStr);
      if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
        const fixed = fixCoordinatesIfNeeded(parsed.lat, parsed.lng);
        const cityName = isValidCityName(savedCity) ? savedCity : undefined;

        logDiagnostic("cached", fixed.lat, fixed.lng, cityName);

        return {
          lat: fixed.lat,
          lng: fixed.lng,
          cityName,
          method: "cached"
        };
      }
    }
  } catch (e) {
    console.warn("Cache read error:", e);
  }

  // Default fallback if all fails: Warszawa
  console.warn("⚠️ [Geo] All detection methods failed. Using default location (Warszawa).");
  logDiagnostic("fallback", 52.2297, 21.0122, "Warszawa");
  return {
    lat: 52.2297,
    lng: 21.0122,
    cityName: "Warszawa",
    method: "fallback"
  };
}

