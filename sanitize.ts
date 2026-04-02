const RICH_TEXT_LIMIT = 10_000;

function normalizeInput(value: string): string {
  return value.replaceAll("\u0000", "").trim();
}

export function sanitizeContentRichText(value: string): string {
  const normalized = normalizeInput(value).slice(0, RICH_TEXT_LIMIT);
  // Keep simple formatting while removing dangerous HTML/script payloads.
  return normalized
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\sstyle\s*=\s*(['"]).*?\1/gi, "")
    .trim();
}

export function sanitizeContentLink(value: string): string | null {
  const normalized = normalizeInput(value);
  if (!normalized) return null;
  if (normalized.startsWith("/")) return normalized;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

