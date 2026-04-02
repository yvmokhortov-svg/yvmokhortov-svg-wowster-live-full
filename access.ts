export type AccessTier = "none" | "trial" | "subscription";

export type AccessInput = {
  hasActiveSubscription: boolean;
  hasActiveGrant?: boolean;
  trialAttendedCount: number;
  trialLimit?: number;
};

export type AccessDecision = {
  tier: AccessTier;
  canWatchSchoolStream: boolean;
  canUseQnA: boolean;
  canSendChat: boolean;
  reason: string;
};

export function resolveSchoolAccess(input: AccessInput): AccessDecision {
  const trialLimit = input.trialLimit ?? 2;

  if (input.hasActiveSubscription) {
    return {
      tier: "subscription",
      canWatchSchoolStream: true,
      canUseQnA: true,
      canSendChat: true,
      reason: "Active subscription",
    };
  }

  if (input.hasActiveGrant) {
    return {
      tier: "subscription",
      canWatchSchoolStream: true,
      canUseQnA: true,
      canSendChat: true,
      reason: "Active account grant",
    };
  }

  if (input.trialAttendedCount < trialLimit) {
    return {
      tier: "trial",
      canWatchSchoolStream: true,
      canUseQnA: true,
      canSendChat: true,
      reason: "Trial lessons remaining",
    };
  }

  return {
    tier: "none",
    canWatchSchoolStream: false,
    canUseQnA: false,
    canSendChat: false,
    reason: "Trial exhausted and no active access plan",
  };
}
