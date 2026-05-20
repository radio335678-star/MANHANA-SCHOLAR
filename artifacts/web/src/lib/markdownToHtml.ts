/**
 * Converts AI plain-text / markdown output into HTML suitable for TipTap.
 * Strips markdown symbols and produces thesis-style paragraph markup.
 */
export function markdownToHtml(text: string): string {
  if (!text.trim()) return "<p></p>";

  let cleaned = text
    // Remove code fences
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Strip heading markers but keep text
    .replace(/^#{1,6}\s+/gm, "")
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Horizontal rules
    .replace(/^---+$/gm, "")
    // Bullet / numbered list markers at line start
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .trim();

  // Split into paragraphs on double newlines
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return `<p>${cleaned.replace(/\n/g, " ")}</p>`;
  }

  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

/**
 * Converts plain text to simple HTML paragraphs (no markdown parsing).
 */
export function plainTextToHtml(text: string): string {
  return markdownToHtml(text);
}
