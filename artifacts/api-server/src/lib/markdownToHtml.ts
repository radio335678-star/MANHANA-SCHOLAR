export function markdownToHtml(text: string): string {
  if (!text.trim()) return "<p></p>";

  let cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[HIGHLIGHT\]([\s\S]*?)\[\/HIGHLIGHT\]/g, '<mark class="thesis-highlight">$1</mark>')
    .replace(/^---+$/gm, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .trim();

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return `<p>${cleaned.replace(/\n/g, " ")}</p>`;
  }

  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}
