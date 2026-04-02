export const TRIAL_STREAM_WINDOW_MS = 20 * 60 * 1000;

export function isTrialWindowActive(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() <= TRIAL_STREAM_WINDOW_MS;
}

export function trialEndsAtIso(createdAt: Date): string {
  return new Date(createdAt.getTime() + TRIAL_STREAM_WINDOW_MS).toISOString();
}
