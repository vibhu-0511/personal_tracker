// Control characters (CR, LF, NUL ...) and Unicode line breaks would let a title
// end its own content line and start a new property (CRLF injection), so they
// become a single space before escaping.
// eslint-disable-next-line no-control-regex
const LINE_BREAKS_AND_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g

export function sanitizeText(text) {
  return String(text).replace(LINE_BREAKS_AND_CONTROLS, ' ').trim()
}

function icsEscape(text) {
  return sanitizeText(text).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function toICS({ title, start }) {
  const now = icsDate(new Date())
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Forge//Life Tab//EN',
    'BEGIN:VEVENT',
    `UID:${now}-${Math.random().toString(36).slice(2)}@forge`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(start)}`,
    `SUMMARY:${icsEscape(title)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${icsEscape(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function validateICSInput({ title, start }) {
  const t = sanitizeText(title || '')
  if (!t) return { error: 'title is required' }
  if (t.length > 200) return { error: 'title is too long' }

  const d = new Date(start)
  if (!start || Number.isNaN(d.getTime())) return { error: 'start is not a valid date' }

  return { error: null, title: t, start: d }
}
