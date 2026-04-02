type SexualMatch = {
  field: string;
  term: string;
};

type UnsafeMatch = SexualMatch & {
  category: "sexual" | "destructive";
};

const SEXUAL_PATTERNS: Array<{ term: string; pattern: RegExp }> = [
  { term: "sex", pattern: /\bsex\b/i },
  { term: "sexual", pattern: /\bsexual\b/i },
  { term: "sexy", pattern: /\bsexy\b/i },
  { term: "fuck", pattern: /\bfuck(?:ing|ed|er|ers|s|z)?\b/i },
  { term: "suck", pattern: /\bsuck(?:ing|ed|s)?\b/i },
  { term: "porn", pattern: /\bporn\b/i },
  { term: "porno", pattern: /\bporno\b/i },
  { term: "xxx", pattern: /\bxxx\b/i },
  { term: "nsfw", pattern: /\bnsfw\b/i },
  { term: "nude", pattern: /\bnude\b/i },
  { term: "nudity", pattern: /\bnudity\b/i },
  { term: "erotic", pattern: /\berotic\b/i },
  { term: "fetish", pattern: /\bfetish\b/i },
  { term: "penis", pattern: /\bpenis\b/i },
  { term: "vagina", pattern: /\bvagina\b/i },
  { term: "dick", pattern: /\bdick\b/i },
  { term: "cock", pattern: /\bcock\b/i },
  { term: "pussy", pattern: /\bpussy\b/i },
  { term: "boobs", pattern: /\bboobs?\b/i },
  { term: "tits", pattern: /\btits?\b/i },
  { term: "anus", pattern: /\banus\b/i },
  { term: "clitoris", pattern: /\bclitoris\b/i },
  { term: "intercourse", pattern: /\bintercourse\b/i },
  { term: "oral_sex", pattern: /\boral[\s-]?sex\b/i },
  { term: "anal_sex", pattern: /\banal[\s-]?sex\b/i },
  { term: "masturbation", pattern: /\bmasturbat(e|ion|ing)\b/i },
  { term: "hookup", pattern: /\bhook[\s-]?up\b/i },
  { term: "hentai", pattern: /\bhentai\b/i },
  { term: "blowjob", pattern: /\bblow[\s-]?job\b/i },
  { term: "handjob", pattern: /\bhand[\s-]?job\b/i },
  { term: "strip", pattern: /\bstrip(p?er|tease)?\b/i },
  { term: "escort", pattern: /\bescort\b/i },
  { term: "prostitute", pattern: /\bprostitut(e|ion)\b/i },
  { term: "onlyfans", pattern: /\bonly[\s-]?fans\b/i },
];

const DESTRUCTIVE_PATTERNS: Array<{ term: string; pattern: RegExp }> = [
  { term: "kill_yourself", pattern: /\bkill[\s-]?yourself\b/i },
  { term: "go_die", pattern: /\bgo[\s-]?die\b/i },
  { term: "die", pattern: /\bdie\b/i },
  { term: "suicide", pattern: /\bsuicid(e|al)\b/i },
  { term: "murder", pattern: /\bmurder\b/i },
  { term: "shoot", pattern: /\bshoot\b/i },
  { term: "bomb", pattern: /\bbomb\b/i },
  { term: "rape", pattern: /\brape\b/i },
  { term: "hate_you", pattern: /\bhate[\s-]?you\b/i },
];

export function findSexualContent(
  fields: Record<string, string | null | undefined>,
): SexualMatch | null {
  for (const [field, value] of Object.entries(fields)) {
    const text = value?.trim();
    if (!text) continue;

    for (const entry of SEXUAL_PATTERNS) {
      if (entry.pattern.test(text)) {
        return { field, term: entry.term };
      }
    }
  }
  return null;
}

export function findBlockedChatContent(
  fields: Record<string, string | null | undefined>,
): UnsafeMatch | null {
  const sexual = findSexualContent(fields);
  if (sexual) return { ...sexual, category: "sexual" };

  for (const [field, value] of Object.entries(fields)) {
    const text = value?.trim();
    if (!text) continue;
    for (const entry of DESTRUCTIVE_PATTERNS) {
      if (entry.pattern.test(text)) {
        return { field, term: entry.term, category: "destructive" };
      }
    }
  }

  return null;
}
