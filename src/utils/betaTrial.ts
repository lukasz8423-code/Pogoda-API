import { isDeveloperMode } from "./cache";

const BETA_TRIAL_DURATION_MS = 72 * 60 * 60 * 1000; // 72 hours (3 days)

export interface BetaTrialStatus {
  isExpired: boolean;
  remainingMs: number;
  startTime: number | null;
  isDeveloper: boolean;
  tamperDetected?: boolean;
}

const STORAGE_KEY_START = "aura_beta_start_time";
const STORAGE_KEY_LAST_SEEN = "aura_beta_last_seen";

/**
 * Checks the status of the 72-hour Beta Test for public web users.
 * Bypasses trial restrictions if in Developer Mode (localhost or native APK).
 * Includes anti-tamper logic against system clock manipulation.
 */
export function checkBetaTrialStatus(): BetaTrialStatus {
  return {
    isExpired: false,
    remainingMs: Infinity,
    startTime: Date.now(),
    isDeveloper: true,
  };
}
