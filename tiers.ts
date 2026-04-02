export type SubscriptionTierCode =
  | "REFERRAL_TRIO_20"
  | "STANDARD_CLASS_25"
  | "STANDARD_QNA_35"
  | "MENTORSHIP_55"
  | "SUPPORTER_99";

export type SubscriptionTierSpec = {
  code: SubscriptionTierCode;
  name: string;
  cents: number;
  desc: string;
};

// Canonical subscription labels/spec copy. Keep this as the single source
// to avoid UI/API drift in tier naming.
export const SUBSCRIPTION_TIERS: readonly SubscriptionTierSpec[] = [
  {
    code: "REFERRAL_TRIO_20",
    name: "$20 Referral Trio",
    cents: 2000,
    desc: "Referral trio discount, 6 monthly free stickers.",
  },
  {
    code: "STANDARD_CLASS_25",
    name: "$25 Standard Class",
    cents: 2500,
    desc: "Chosen house/class access, 8 upload slots, AI feedback available.",
  },
  {
    code: "STANDARD_QNA_35",
    name: "$35 Standard + Q&A",
    cents: 3500,
    desc: "Standard class access + Q&A chat unlock after lesson.",
  },
  {
    code: "MENTORSHIP_55",
    name: "$55 Mentorship",
    cents: 5500,
    desc: "Teacher reviews at upload #4/#8 + graduation decision and slot 9 tile.",
  },
  {
    code: "SUPPORTER_99",
    name: "$99 Supporter",
    cents: 9900,
    desc: "Mentorship track + supporter badge option.",
  },
] as const;

const allowedTierCentsSet = new Set<number>(SUBSCRIPTION_TIERS.map((tier) => tier.cents));

export function isAllowedSubscriptionTierCents(value: number): boolean {
  return allowedTierCentsSet.has(value);
}
