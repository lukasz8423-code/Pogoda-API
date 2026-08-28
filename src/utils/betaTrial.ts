
export interface BetaTrialStatus {
  isExpired: boolean;
  remainingMs: number;
  startTime: number | null;
  isDeveloper: boolean;
  tamperDetected?: boolean;
}

/**
 * Checks the status of the 72-hour Beta Test for public web users.
 * Bypasses trial restrictions if in Developer Mode (localhost or native APK).
 * Includes anti-tamper logic against system clock manipulation.
 *
 * NOTE: currently always bypassed (returns isExpired: false / isDeveloper: true).
 * The original 72h duration and localStorage keys were removed from here since they
 * were unused as long as this bypass is in place. Re-add them if the trial gate is re-enabled.
 */
export function checkBetaTrialStatus(): BetaTrialStatus {
  return {
    isExpired: false,
    remainingMs: Infinity,
    startTime: Date.now(),
    isDeveloper: true,
  };
}
