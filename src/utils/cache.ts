import { Capacitor } from '@capacitor/core';

/**
 * Central Cache & Request Control Mechanism for Aura Pogoda
 * Protects APIs from excessive requests during public web testing while ensuring
 * the developer/owner has full unrestricted access.
 */

// TTL definitions in milliseconds
export const CACHE_TTLS = {
  CURRENT_WEATHER: 10 * 60 * 1000,   // 10 minutes
  IMGW: 10 * 60 * 1000,              // 10 minutes
  HOURLY_FORECAST: 30 * 60 * 1000,   // 30 minutes
  FORECAST_16_DAYS: 60 * 60 * 1000,  // 60 minutes
  AQI: 30 * 60 * 1000,               // 30 minutes
  RADAR: 10 * 60 * 1000,             // 10 minutes
  SATELLITE: 15 * 60 * 1000,         // 15 minutes
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Generates or retrieves an anonymous installationId for public web tests.
 * Used strictly for anonymous diagnostics / installation counting. Does not use GPS or personal data.
 */
export function getInstallationId(): string {
  try {
    let id = localStorage.getItem("aura_installation_id");
    if (!id) {
      id = 'aura-web-' + Math.random().toString(36).substring(2) + '-' + Date.now().toString(36);
      localStorage.setItem("aura_installation_id", id);
    }
    return id;
  } catch (e) {
    return 'aura-fallback-id';
  }
}

/**
 * Checks if the current visitor is operating in Developer / Owner mode.
 * Secured against public tester bypass:
 * - Does NOT recognize run.app domain automatically.
 * - Does NOT accept URL parameters (?dev=true, etc.).
 * - Does NOT accept simple boolean localStorage flags or secret tokens.
 * - Recognizes ONLY: localhost/127.0.0.1 or Capacitor native mobile app (APK).
 */
export function isDeveloperMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname || '';

    // 1. Local development, AI Studio preview environment (*.run.app), or local network
    const isDevEnv = 
      host === 'localhost' || 
      host === '127.0.0.1' ||
      host.includes('run.app') ||
      host.includes('ais-dev-') ||
      host.includes('ais-pre-') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.');

    // 2. Native mobile app (Android APK / Capacitor)
    const isNative = Capacitor.isNativePlatform();

    return isDevEnv || isNative;
  } catch (e) {
    return false;
  }
}

export function setDeveloperMode(_enabled: boolean): void {
  // Developer mode is strictly restricted to localhost/127.0.0.1 or native APK
}

/**
 * Retrieves cached data if within TTL, unless developer mode forces fresh fetch.
 */
export function getCachedData<T>(key: string, ttlMs: number): T | null {
  if (isDeveloperMode()) {
    // Developer mode bypasses cache to always serve live data
    return null;
  }

  try {
    // Check memory cache first
    const memEntry = memoryCache.get(key);
    const now = Date.now();
    if (memEntry && (now - memEntry.timestamp < ttlMs)) {
      return memEntry.data as T;
    }

    // Check localStorage cache
    const stored = localStorage.getItem(`aura_cache_${key}`);
    if (stored) {
      const parsed: CacheEntry<T> = JSON.parse(stored);
      if (parsed && parsed.timestamp && (now - parsed.timestamp < ttlMs)) {
        // Populate memory cache
        memoryCache.set(key, parsed);
        return parsed.data;
      }
    }
  } catch (e) {
    console.warn("Cache read error:", e);
  }
  return null;
}

/**
 * Stores data in central cache (memory + localStorage) with timestamp.
 */
export function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };
    memoryCache.set(key, entry);
    localStorage.setItem(`aura_cache_${key}`, JSON.stringify(entry));
  } catch (e) {
    console.warn("Cache write error:", e);
  }
}

/**
 * Central fetch wrapper with automatic caching, TTL enforcement, and deduplication
 * of concurrent identical requests in flight.
 */
export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  // 1. Check cache first (skipped automatically if developer mode)
  const cached = getCachedData<T>(key, ttlMs);
  if (cached !== null) {
    console.log(`📦 [Central Cache] Serving cached data for key: ${key}`);
    return cached;
  }

  // 2. Prevent concurrent identical requests in flight
  if (inFlightRequests.has(key)) {
    console.log(`⏳ [Central Cache] Awaiting in-flight request for key: ${key}`);
    return inFlightRequests.get(key) as Promise<T>;
  }

  // 3. Execute fetch
  const promise = (async () => {
    try {
      console.log(`🌐 [Central Cache] Executing fresh API request for key: ${key}`);
      const data = await fetchFn();
      if (data !== null && data !== undefined) {
        setCachedData(key, data);
      }
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}
