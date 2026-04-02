function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export const flags = {
  paymentsEnabled: parseBool(process.env.PAYMENTS_ENABLED, false),
  trialEnabled: parseBool(process.env.TRIAL_ENABLED, true),
  grantsFeatureEnabled: parseBool(process.env.GRANTS_FEATURE_ENABLED, false),
  twoCheckoutForceMock: parseBool(process.env.TWOCHECKOUT_FORCE_MOCK, false),
};
