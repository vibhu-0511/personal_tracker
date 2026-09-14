function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;')
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
  const t = String(title || '').trim()
  if (!t) return { error: 'title is required' }
  if (t.length > 200) return { error: 'title is too long' }

  const d = new Date(start)
  if (!start || Number.isNaN(d.getTime())) return { error: 'start is not a valid date' }

  return { error: null, title: t, start: d }
}
