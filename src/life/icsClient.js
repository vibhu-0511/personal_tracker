// Client-side reminder .ics generation. Native (Capacitor) builds have no API, and a link to
// /api/ics can neither carry an Authorization header nor stay inside the WKWebView, so the
// calendar file is built here from the same pure generator the server uses. That keeps the
// CRLF-injection protection (control characters and Unicode line breaks become spaces)
// identical on both paths.
import { toICS, validateICSInput, sanitizeText } from '../../api/_lib/ics.js'

const MAX_TITLE = 200

// Build the .ics text for a reminder ({ title, at }), or null when it has no usable title or
// time. Unlike the server (which answers 400 for an over-long title) an over-long title is
// truncated, so a long reminder can still be added to the calendar.
export function buildReminderICS(reminder) {
  if (!reminder) return null
  const title = sanitizeText(reminder.title ?? '').slice(0, MAX_TITLE).trim()
  const start = reminder.at == null ? null : new Date(reminder.at)
  const out = validateICSInput({ title, start })
  if (out.error) return null
  return toICS({ title: out.title, start: out.start })
}

// A data: URL for the same content, usable as a plain href fallback. Percent-encoding keeps
// the CRLF line endings intact.
export function reminderICSDataUrl(reminder) {
  const ics = buildReminderICS(reminder)
  return ics ? `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` : '#'
}

// Hand the file to the platform without touching the network: a Blob behind a temporary
// download link. Returns false when there was nothing to export.
export function downloadReminderICS(reminder, doc = globalThis.document) {
  const ics = buildReminderICS(reminder)
  if (!ics || !doc) return false
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = 'reminder.ics'
  a.rel = 'noopener'
  a.style.display = 'none'
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
