import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * A hybrid fetch utility that uses Capacitor Native HTTP on native platforms
 * to bypass CORS, and standard fetch on web with strict timeout.
 */
export async function smartFetch(url: string, options: any = {}, timeoutMs = 5000) {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const response = await CapacitorHttp.get({
        url,
        params: options.params || {},
        headers: options.headers || {},
      });
      
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.data,
        text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      };
    } catch (err) {
      console.error(`Native fetch failed for ${url}:`, err);
      throw err;
    }
  }

  // Web fallback with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: options.signal || controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
