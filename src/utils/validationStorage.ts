import { calculateApparentTemperature } from './weatherUtils';

export interface ValidationSample {
  id: string;
  timestamp: string;
  auraTemperature: number | null;
  auraApparentTemperature: number | null;
  rawOpenMeteoTemperature: number | null;
  rawOpenMeteoApparentTemperature: number | null;
  imgwTemperature: number | null;
  imgwApparentTemperature: number | null;
  imgwMeasurementTime: string | null;
  imgwAgeMinutes: number;
  calibrationMode: 'FRESH_IMGW' | 'DYNAMIC_MODEL_WITH_BIAS' | 'DECAYING_BIAS' | 'MODEL_ONLY' | string;
  originalBias: number;
  biasWeight: number;
  effectiveBias: number;
  auraError: number | null;
  openMeteoError: number | null;
  absAuraError: number | null;
  absOpenMeteoError: number | null;
  isOutdated: boolean;
  isReference?: boolean;
}

export interface ModelStats {
  mae: number | null;
  meanError: number | null;
  maxAbsoluteError: number | null;
}

export interface ValidationStats {
  sampleCount: number;
  validReferenceCount: number;
  aura: ModelStats;
  openMeteo: ModelStats;
  comparison: {
    auraCloserCount: number;
    openMeteoCloserCount: number;
    tieCount: number;
    auraMaeImprovement: number | null;
  };
}

const STORAGE_KEY = 'aura_validation_samples_v1';
const REFERENCE_STORAGE_KEY = 'aura_reference_samples_v1';
const MAX_DIAGNOSTIC_BUFFER_SIZE = 30;
const MAX_REFERENCE_ARCHIVE_SIZE = 100;

/**
 * Loads diagnostic buffer validation samples from localStorage (max 30).
 */
export function loadValidationSamples(): ValidationSample[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_DIAGNOSTIC_BUFFER_SIZE) : [];
  } catch (e) {
    console.warn('Failed to load aura validation samples from localStorage:', e);
    return [];
  }
}

/**
 * Saves diagnostic buffer validation samples to localStorage.
 */
export function saveValidationSamples(samples: ValidationSample[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples.slice(-MAX_DIAGNOSTIC_BUFFER_SIZE)));
  } catch (e) {
    console.warn('Failed to save aura validation samples to localStorage:', e);
  }
}

/**
 * Loads durable reference samples from localStorage.
 * Performs safe auto-migration from legacy validation samples if reference store is empty.
 */
export function loadReferenceSamples(): ValidationSample[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REFERENCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(-MAX_REFERENCE_ARCHIVE_SIZE);
      }
    }

    // Safe migration from existing validation storage if reference storage is empty
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
        const migratedRefs: ValidationSample[] = [];
        for (const sample of parsedLegacy) {
          if (
            sample &&
            typeof sample.imgwTemperature === 'number' &&
            typeof sample.rawOpenMeteoTemperature === 'number' &&
            typeof sample.auraTemperature === 'number' &&
            (sample.isReference || !sample.isOutdated || sample.imgwAgeMinutes <= 30 || sample.calibrationMode === 'FRESH_IMGW')
          ) {
            const normalizedSample: ValidationSample = {
              ...sample,
              isReference: true,
              isOutdated: false
            };
            const isDup = migratedRefs.some(r =>
              (r.imgwMeasurementTime && normalizedSample.imgwMeasurementTime && r.imgwMeasurementTime === normalizedSample.imgwMeasurementTime) ||
              (r.imgwTemperature === normalizedSample.imgwTemperature && r.rawOpenMeteoTemperature === normalizedSample.rawOpenMeteoTemperature && r.auraTemperature === normalizedSample.auraTemperature)
            );
            if (!isDup) {
              migratedRefs.push(normalizedSample);
            }
          }
        }
        if (migratedRefs.length > 0) {
          saveReferenceSamples(migratedRefs);
          return migratedRefs;
        }
      }
    }

    return [];
  } catch (e) {
    console.warn('Failed to load aura reference samples from localStorage:', e);
    return [];
  }
}

/**
 * Saves durable reference samples to localStorage.
 */
export function saveReferenceSamples(samples: ValidationSample[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REFERENCE_STORAGE_KEY, JSON.stringify(samples.slice(-MAX_REFERENCE_ARCHIVE_SIZE)));
  } catch (e) {
    console.warn('Failed to save aura reference samples to localStorage:', e);
  }
}

/**
 * Adds a reference sample to the archive with strict deduplication by IMGW measurement time.
 */
export function addReferenceSampleToArchive(
  archive: ValidationSample[],
  sample: ValidationSample
): { updated: ValidationSample[]; added: boolean } {
  if (!sample || !sample.isReference || sample.imgwTemperature === null || sample.rawOpenMeteoTemperature === null || sample.auraTemperature === null) {
    return { updated: archive, added: false };
  }

  // Deduplication check: verify if an entry for this exact IMGW measurement already exists
  const isDuplicate = archive.some(existing => {
    if (existing.imgwMeasurementTime && sample.imgwMeasurementTime) {
      return existing.imgwMeasurementTime === sample.imgwMeasurementTime;
    }
    // Fallback deduplication: same temperature & close timestamp (< 30 min)
    if (existing.imgwTemperature === sample.imgwTemperature) {
      const t1 = new Date(existing.timestamp).getTime();
      const t2 = new Date(sample.timestamp).getTime();
      if (!isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 30 * 60 * 1000) {
        return true;
      }
    }
    return false;
  });

  if (isDuplicate) {
    return { updated: archive, added: false };
  }

  const updated = [...archive, { ...sample, isReference: true, isOutdated: false }].slice(-MAX_REFERENCE_ARCHIVE_SIZE);
  return { updated, added: true };
}

/**
 * Clears both validation samples buffer and reference archive from localStorage.
 */
export function clearValidationSamples(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(REFERENCE_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear validation samples:', e);
  }
}

/**
 * Helper to compute stats strictly from the reference samples dataset.
 */
export function computeValidationStats(
  referenceSamples: ValidationSample[],
  totalDiagnosticSampleCount?: number
): ValidationStats {
  const validReferenceSamples = referenceSamples.filter(
    s => s.auraError !== null && s.openMeteoError !== null && s.absAuraError !== null && s.absOpenMeteoError !== null
  );

  const sampleCount = totalDiagnosticSampleCount ?? referenceSamples.length;
  const validReferenceCount = validReferenceSamples.length;

  if (validReferenceCount === 0) {
    return {
      sampleCount,
      validReferenceCount,
      aura: { mae: null, meanError: null, maxAbsoluteError: null },
      openMeteo: { mae: null, meanError: null, maxAbsoluteError: null },
      comparison: {
        auraCloserCount: 0,
        openMeteoCloserCount: 0,
        tieCount: 0,
        auraMaeImprovement: null
      }
    };
  }

  const count = validReferenceCount;

  // Aura metrics calculated EXCLUSIVELY on validReferenceSamples
  const auraAbsErrors = validReferenceSamples.map(s => s.absAuraError!);
  const auraRawErrors = validReferenceSamples.map(s => s.auraError!);
  const auraMae = auraAbsErrors.reduce((a, b) => a + b, 0) / count;
  const auraMeanErr = auraRawErrors.reduce((a, b) => a + b, 0) / count;
  const auraMaxAbs = Math.max(...auraAbsErrors);

  // Open-Meteo metrics calculated EXCLUSIVELY on validReferenceSamples
  const omAbsErrors = validReferenceSamples.map(s => s.absOpenMeteoError!);
  const omRawErrors = validReferenceSamples.map(s => s.openMeteoError!);
  const omMae = omAbsErrors.reduce((a, b) => a + b, 0) / count;
  const omMeanErr = omRawErrors.reduce((a, b) => a + b, 0) / count;
  const omMaxAbs = Math.max(...omAbsErrors);

  // Comparison metrics calculated EXCLUSIVELY on validReferenceSamples
  let auraCloser = 0;
  let omCloser = 0;
  let ties = 0;

  validReferenceSamples.forEach(s => {
    const diff = Math.abs(s.absAuraError! - s.absOpenMeteoError!);
    if (diff < 0.01) {
      ties++;
    } else if (s.absAuraError! < s.absOpenMeteoError!) {
      auraCloser++;
    } else {
      omCloser++;
    }
  });

  const improvement = omMae - auraMae;

  return {
    sampleCount,
    validReferenceCount,
    aura: {
      mae: Number(auraMae.toFixed(2)),
      meanError: Number(auraMeanErr.toFixed(2)),
      maxAbsoluteError: Number(auraMaxAbs.toFixed(2))
    },
    openMeteo: {
      mae: Number(omMae.toFixed(2)),
      meanError: Number(omMeanErr.toFixed(2)),
      maxAbsoluteError: Number(omMaxAbs.toFixed(2))
    },
    comparison: {
      auraCloserCount: auraCloser,
      openMeteoCloserCount: omCloser,
      tieCount: ties,
      auraMaeImprovement: Number(improvement.toFixed(2))
    }
  };
}

/**
 * Creates a new validation sample if current weather data contains a valid IMGW reference.
 */
export function createValidationSampleFromCurrentData(
  calDetails: {
    calibratedTemp: number | null;
    rawOpenMeteoTemp?: number | null;
    imgwTemp?: number | null;
    measurementHourStr?: string | null;
    delayMinutes: number;
    calibrationMode?: string;
    originalBias?: number;
    biasWeight?: number;
    effectiveBias?: number;
    statusLabel: string;
  },
  omApparentTemp: number | null,
  imgwStation?: {
    temp?: number | null;
    humidity?: number | null;
    windSpeed?: number | null;
    windGust?: number | null;
    measurementTime?: string | null;
    lastSync?: string | null;
  } | null,
  currentHumidity?: number | null,
  currentWindSpeed?: number | null,
  currentWindGust?: number | null
): ValidationSample | null {
  const auraTemp = calDetails.calibratedTemp;
  const omTemp = calDetails.rawOpenMeteoTemp ?? null;
  const imgwTemp = calDetails.imgwTemp ?? (typeof imgwStation?.temp === 'number' ? imgwStation.temp : null);

  // If essential data for comparison is missing, do not record sample
  if (auraTemp === null || omTemp === null || imgwTemp === null) {
    return null;
  }

  const measurementTime = imgwStation?.measurementTime || imgwStation?.lastSync || calDetails.measurementHourStr || null;
  const ageMinutes = calDetails.delayMinutes;

  // Apparent temperatures
  const auraApparent = calculateApparentTemperature(auraTemp, currentHumidity, currentWindSpeed, currentWindGust)
    ?? (omApparentTemp !== null ? Number((omApparentTemp + (calDetails.effectiveBias ?? 0)).toFixed(1)) : null);

  const imgwApparent = calculateApparentTemperature(
    imgwTemp,
    imgwStation?.humidity ?? currentHumidity,
    imgwStation?.windSpeed ?? currentWindSpeed,
    imgwStation?.windGust ?? currentWindGust
  );

  // Errors relative to IMGW reference
  const auraError = Number((auraTemp - imgwTemp).toFixed(2));
  const openMeteoError = Number((omTemp - imgwTemp).toFixed(2));
  const absAuraError = Number(Math.abs(auraError).toFixed(2));
  const absOpenMeteoError = Number(Math.abs(openMeteoError).toFixed(2));

  const mode = calDetails.calibrationMode || (ageMinutes < 30 ? 'FRESH_IMGW' : ageMinutes <= 75 ? 'DYNAMIC_MODEL_WITH_BIAS' : ageMinutes <= 120 ? 'DECAYING_BIAS' : 'MODEL_ONLY');
  const isFresh = ageMinutes <= 30 || mode === 'FRESH_IMGW';
  const isOutdated = !isFresh;

  return {
    id: `${measurementTime || 'now'}_${imgwTemp}_${omTemp}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    auraTemperature: auraTemp,
    auraApparentTemperature: auraApparent !== null ? Number(auraApparent.toFixed(1)) : null,
    rawOpenMeteoTemperature: omTemp,
    rawOpenMeteoApparentTemperature: omApparentTemp,
    imgwTemperature: imgwTemp,
    imgwApparentTemperature: imgwApparent !== null ? Number(imgwApparent.toFixed(1)) : null,
    imgwMeasurementTime: measurementTime,
    imgwAgeMinutes: ageMinutes,
    calibrationMode: mode,
    originalBias: calDetails.originalBias ?? Number((imgwTemp - omTemp).toFixed(2)),
    biasWeight: calDetails.biasWeight ?? (mode === 'FRESH_IMGW' || mode === 'DYNAMIC_MODEL_WITH_BIAS' ? 1.0 : 0.0),
    effectiveBias: calDetails.effectiveBias ?? 0,
    auraError,
    openMeteoError,
    absAuraError,
    absOpenMeteoError,
    isOutdated,
    isReference: isFresh
  };
}

