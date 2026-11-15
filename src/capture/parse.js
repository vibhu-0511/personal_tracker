// Capture parser: one sentence -> a typed draft. Pure, no DOM, no storage.
// Dates and times come from parseQuick (src/life/logic.js). A forced type
// (the chip row) overrides inference. A category is only set on a keyword
// match; otherwise it stays null and the UI asks.
import { dateKey, parseQuick, MANUAL_MOODS } from '../life/logic.js'
import { CATEGORIES, MAX_AMOUNT } from '../money/categories.js'

export const TYPES = ['expense', 'note', 'reminder', 'task', 'habit', 'solve', 'mood']

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))

// keyword -> category id. Only unambiguous words; no match means no category.
const CATEGORY_KEYWORDS = {
  coffee: ['coffee', 'cafe', 'latte', 'cappuccino', 'espresso', 'starbucks'],
  food: ['lunch', 'dinner', 'breakfast', 'snack', 'snacks', 'pizza', 'burger', 'biryani', 'restaurant', 'zomato', 'swiggy', 'food'],
  transport: ['uber', 'ola', 'cab', 'taxi', 'metro', 'bus', 'petrol', 'fuel', 'parking', 'rickshaw'],
  groceries: ['grocery', 'groceries', 'vegetables', 'milk', 'bigbasket', 'blinkit'],
  shopping: ['amazon', 'flipkart', 'clothes', 'shoes', 'shopping'],
  bills: ['electricity', 'wifi', 'rent', 'recharge', 'bill', 'bills'],
  entertainment: ['movie', 'movies', 'concert', 'games', 'bowling'],
  health: ['doctor', 'medicine', 'medicines', 'pharmacy', 'gym', 'dentist'],
  subscriptions: ['netflix', 'spotify', 'prime', 'subscription'],
  travel: ['flight', 'hotel', 'train', 'trip', 'hostel'],
}

const KEYWORD_TO_CATEGORY = new Map()
for (const [id, words] of Object.entries(CATEGORY_KEYWORDS)) {
  if (!CATEGORY_IDS.has(id)) throw new Error(`unknown category ${id}`)
  for (const w of words) KEYWORD_TO_CATEGORY.set(w, id)
}

const PLATFORMS = {
  cf: 'codeforces',
  codeforces: 'codeforces',
  lc: 'leetcode',
  leetcode: 'leetcode',
  atcoder: 'atcoder',
  cc: 'codechef',
  codechef: 'codechef',
}

const MOOD_WORDS = {
  awful: 0, terrible: 0, horrible: 0,
  bad: 25, sad: 25, low: 25, down: 25, tired: 25,
  ok: 50, okay: 50, meh: 50, fine: 50, neutral: 50,
  good: 75, nice: 75, calm: 75,
  great: 100, happy: 100, amazing: 100, awesome: 100,
}

const VALID_MOOD_VALUES = new Set(MANUAL_MOODS.map((m) => m.value))

const DATE_TOKEN_RES = [
  /\bin\s+\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i,
  /\btomorrow\b/i,
  /\btoday\b/i,
  /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
]
const TIME_TOKEN_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i

const REMIND_RE = /\bremind(?:er)?\b(?:\s+me)?(?:\s+to)?/i
const REPEAT_RES = [
  { re: /\bevery\s*day\b|\bdaily\b/i, repeat: 'daily', keepWeekday: false },
  { re: /\bevery\s+(?=(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b)/i, repeat: 'weekly', keepWeekday: true },
  { re: /\bevery\s*week\b|\bweekly\b/i, repeat: 'weekly', keepWeekday: false },
  { re: /\bevery\s*month\b|\bmonthly\b/i, repeat: 'monthly', keepWeekday: false },
]

const AMOUNT_RES = [
  // currency marker before or after the number
  /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d{1,2})?)(k)?(?![\w:])/i,
  /(?<![\w.:])(\d[\d,]*(?:\.\d{1,2})?)(k)?\s*(?:₹|rs\b\.?|rupees\b|inr\b)/i,
  // bare number token
  /(?<![\w.:#-])(\d[\d,]*(?:\.\d{1,2})?)(k)?(?![\w:])/i,
]

function squash(s) {
  return s.replace(/\s{2,}/g, ' ').trim()
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function findAmount(text) {
  for (const re of AMOUNT_RES) {
    const m = text.match(re)
    if (!m) continue
    let value = Number(m[1].replace(/,/g, ''))
    if (m[2]) value *= 1000
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) continue
    return { value, match: m[0] }
  }
  return null
}

function findCategory(text) {
  let best = null
  const re = /[a-z]+/gi
  let m
  while ((m = re.exec(text))) {
    const id = KEYWORD_TO_CATEGORY.get(m[0].toLowerCase())
    if (id) {
      best = { id, word: m[0] }
      break
    }
  }
  return best
}

function findSolve(text) {
  const verb = text.match(/\b(?:solved|solve|cracked)\b/i)
  const plat = text.match(/\b(cf|codeforces|lc|leetcode|atcoder|cc|codechef)\b\s*#?\s*([A-Za-z0-9_-]+)?/i)
  let platform = null
  let id = null
  const used = []
  if (verb) used.push(verb[0])
  if (plat) {
    platform = PLATFORMS[plat[1].toLowerCase()]
    if (plat[2] && /\d/.test(plat[2])) id = plat[2]
    used.push(plat[0].trim())
  }
  if (!id) {
    const idm = text.match(/(?<![\w])(\d{1,5}[A-Za-z]\d?|\d{1,5})(?![\w])/)
    if (idm && plat) {
      id = idm[1]
      used.push(idm[0])
    }
  }
  const hit = Boolean(verb || (plat && id))
  return { hit, platform, id, used }
}

function findMood(text) {
  const kw = text.match(/\b(?:mood|feeling|feel|feels|felt)\b/i)
  let word = null
  let value = null
  const re = /[a-z]+/gi
  let m
  while ((m = re.exec(text))) {
    const v = MOOD_WORDS[m[0].toLowerCase()]
    if (v !== undefined && VALID_MOOD_VALUES.has(v)) {
      word = m[0]
      value = v
      break
    }
  }
  return { hit: Boolean(kw), keyword: kw ? kw[0] : null, word, value }
}

function dateTokens(text) {
  const out = []
  for (const re of DATE_TOKEN_RES) {
    const m = text.match(re)
    if (m) out.push({ kind: 'date', text: m[0] })
  }
  const t = text.match(TIME_TOKEN_RE)
  if (t) out.push({ kind: 'time', text: t[0] })
  return out
}

function stripRepeat(text) {
  let work = text
  let repeat = null
  let used = null
  for (const r of REPEAT_RES) {
    const m = work.match(r.re)
    if (!m) continue
    repeat = r.repeat
    used = squash(m[0])
    work = work.replace(r.re, r.keepWeekday ? '' : ' ')
    break
  }
  return { work: squash(work), repeat, used }
}

function emptyDraft(type, inferred) {
  return {
    type,
    inferred,
    title: '',
    amount: null,
    category: null,
    person: null,
    date: null,
    at: null,
    repeat: null,
    problem: null,
    mood: null,
    tokens: [],
  }
}

// parseCapture(text, now?, { type? }) -> draft
//   type: forced type from the chip row; overrides inference.
//   date: 'YYYY-MM-DD' (local) or null; at: Date or null.
//   tokens: [{ kind, text }] source pieces the parser used.
export function parseCapture(text, now = new Date(), opts = {}) {
  const raw = typeof text === 'string' ? text.trim() : ''
  const forced = TYPES.includes(opts?.type) ? opts.type : null

  // ---- inference (on the raw text) ----
  const solve = findSolve(raw)
  const mood = findMood(raw)
  const quick = parseQuick(raw, now)
  const amountProbe = findAmount(quick.title)
  const remind = raw.match(REMIND_RE)
  const repeatProbe = stripRepeat(raw)

  let inferredType = 'note'
  if (solve.hit) inferredType = 'solve'
  else if (mood.hit) inferredType = 'mood'
  else if (/^\s*habit\b/i.test(raw)) inferredType = 'habit'
  else if (remind || repeatProbe.repeat) inferredType = 'reminder'
  else if (amountProbe) inferredType = 'expense'
  else if (quick.date || quick.at) inferredType = 'reminder'

  const type = forced || inferredType
  const draft = emptyDraft(type, !forced)

  switch (type) {
    case 'expense': {
      let work = quick.title
      const tokens = dateTokens(raw)
      const amount = findAmount(work)
      if (amount) {
        work = work.replace(amount.match, ' ')
        tokens.unshift({ kind: 'amount', text: amount.match.trim() })
        draft.amount = amount.value
      }
      const personM = work.match(/\bwith\s+([A-Za-z][A-Za-z'-]*)/i)
      if (personM) {
        draft.person = capitalize(personM[1])
        work = work.replace(personM[0], ' ')
        tokens.push({ kind: 'person', text: personM[0] })
      }
      work = squash(work)
      const cat = findCategory(work)
      if (cat) {
        draft.category = cat.id
        tokens.push({ kind: 'category', text: cat.word })
      }
      draft.title = work
      draft.date = quick.date ? dateKey(quick.date) : dateKey(now)
      draft.at = quick.at
      draft.tokens = orderTokens(tokens, raw)
      break
    }
    case 'reminder':
    case 'task': {
      const tokens = []
      let work = raw
      if (type === 'reminder') {
        const rep = stripRepeat(work)
        work = rep.work
        if (rep.repeat) {
          draft.repeat = rep.repeat
          tokens.push({ kind: 'repeat', text: rep.used })
        } else {
          draft.repeat = 'never'
        }
        const rm = work.match(REMIND_RE)
        if (rm) {
          tokens.push({ kind: 'remind', text: squash(rm[0]) })
          work = work.replace(REMIND_RE, ' ')
        }
      }
      const q = parseQuick(squash(work), now)
      tokens.push(...dateTokens(work))
      draft.title = squash(q.title)
      draft.date = q.date ? dateKey(q.date) : null
      draft.at = q.at
      draft.tokens = orderTokens(tokens, raw)
      break
    }
    case 'solve': {
      draft.title = raw
      draft.problem = { platform: solve.platform, id: solve.id }
      draft.tokens = orderTokens(solve.used.map((t) => ({ kind: 'solve', text: t })), raw)
      break
    }
    case 'mood': {
      draft.title = raw
      draft.mood = mood.value
      const tokens = []
      if (mood.keyword) tokens.push({ kind: 'mood', text: mood.keyword })
      if (mood.word) tokens.push({ kind: 'mood', text: mood.word })
      draft.tokens = orderTokens(tokens, raw)
      break
    }
    case 'habit': {
      const m = raw.match(/^\s*habit\b[:\s-]*/i)
      draft.title = squash(raw.replace(/^\s*habit\b[:\s-]*/i, ''))
      if (m) draft.tokens = [{ kind: 'habit', text: m[0].trim() }]
      break
    }
    default: {
      // note: keep the sentence exactly as typed, nothing is consumed.
      draft.title = raw
    }
  }

  return draft
}

function orderTokens(tokens, raw) {
  const lower = raw.toLowerCase()
  const seen = new Set()
  return tokens
    .filter((t) => t.text && !seen.has(t.kind + '|' + t.text.toLowerCase()) && seen.add(t.kind + '|' + t.text.toLowerCase()))
    .map((t) => ({ ...t, pos: lower.indexOf(t.text.toLowerCase()) }))
    .sort((a, b) => (a.pos < 0 ? 1e9 : a.pos) - (b.pos < 0 ? 1e9 : b.pos))
    .map(({ kind, text }) => ({ kind, text }))
}
