function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeChatRichText(input: string): string {
  let output = escapeHtml(input);

  // Re-enable a small, safe subset of formatting tags for richer chat.
  const simpleTags = ["b", "strong", "i", "em", "u", "s", "code", "mark"];
  for (const tag of simpleTags) {
    const open = new RegExp(`&lt;${tag}&gt;`, "gi");
    const close = new RegExp(`&lt;\\/${tag}&gt;`, "gi");
    output = output.replace(open, `<${tag}>`).replace(close, `</${tag}>`);
  }

  // Support line break tags.
  output = output
    .replace(/&lt;br\s*\/?&gt;/gi, "<br />")
    .replace(/(?:\r\n|\r|\n)/g, "<br />");

  return output;
}
