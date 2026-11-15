// Derive a note's title and excerpt from its text. Pure; no side effects.

const TITLE_MAX = 80

// Title: first non-empty line, trimmed, capped at 80 chars.
// Excerpt: every line after it, collapsed to a single line ('' for a one-line note).
export function deriveNoteTitle(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/)
  const i = lines.findIndex((l) => l.trim() !== '')
  if (i === -1) return { title: '', excerpt: '' }
  const title = lines[i].trim().slice(0, TITLE_MAX).trimEnd()
  const excerpt = lines.slice(i + 1).join(' ').replace(/\s+/g, ' ').trim()
  return { title, excerpt }
}
