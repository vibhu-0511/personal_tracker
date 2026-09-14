// Pure habit/task/reminder math for the Life tab. No DOM, no storage — easy to test.

export const CATEGORIES = {
  exercise: 100,
  study: 80,
  nojunk: 70,
  sleep: 60,
  reading: 50,
  meditation: 40,
  journaling: 30,
  water: 20,
  custom: 30,
}

export const CATEGORY_LABELS = {
  exercise: '🏋️ Exercise',
  study: '📚 Deep work / study',
  nojunk: '🥗 No junk food',
  sleep: '😴 Sleep on time',
  reading: '📖 Reading',
  meditation: '🧘 Meditation',
  journaling: '✍️ Journaling',
  water: '💧 Water',
  custom: '⭐ Custom',
}

export const MILESTONES = [3, 7, 14, 30, 60, 100]

export const TRAITS = [
  { days: 3, label: 'learned to sit' },
  { days: 7, label: 'fetches the ball' },
  { days: 14, label: 'keeps its room tidy' },
  { days: 30, label: 'brushes its teeth' },
  { days: 60, label: 'mentors younger pets' },
  { days: 100, label: 'legendary' },
]

const MULTIPLIER_TIERS = [
  { min: 30, value: 3 },
  { min: 14, value: 2 },
  { min: 7, value: 1.5 },
  { min: 3, value: 1.25 },
  { min: 1, value: 1 },
]

export function dateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Calendar-day number (UTC-anchored so DST never shifts the arithmetic),
// built from the *local* y/m/d parts a dateKey already carries.
function dayNum(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

export function multiplier(streakLen) {
  const tier = MULTIPLIER_TIERS.find((t) => streakLen >= t.min)
  return tier ? tier.value : 1
}

export function streaks(checkins, today) {
  const set = new Set(checkins)
  const todayNum = dayNum(dateKey(today))
  let current = 0
  let cursor = set.has(dateKey(today)) ? todayNum : todayNum - 1
  while (set.has(fromDayNum(cursor))) {
    current++
    cursor--
  }

  const sorted = [...set].map(dayNum).sort((a, b) => a - b)
  let best = 0
  let run = 0
  let prev = null
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = n
  }
  return { current, best }
}

function fromDayNum(n) {
  const d = new Date(n * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function earnings(habit, today) {
  const value = CATEGORIES[habit.category] ?? CATEGORIES.custom
  const sorted = [...new Set(habit.checkins)].sort((a, b) => dayNum(a) - dayNum(b))
  const todayKey = dateKey(today)

  let total = 0
  let todayEarned = 0
  let streakLen = 0
  let prevNum = null
  for (const key of sorted) {
    const n = dayNum(key)
    streakLen = prevNum !== null && n === prevNum + 1 ? streakLen + 1 : 1
    const amount = value * multiplier(streakLen)
    total += amount
    if (key === todayKey) todayEarned = amount
    prevNum = n
  }

  const { current } = streaks(habit.checkins, today)
  const nextTier = MULTIPLIER_TIERS.map((t) => t.min).filter((min) => min > current).sort((a, b) => a - b)[0]
  const nextMultiplierIn = nextTier ? nextTier - current : null

  return { total, today: todayEarned, nextMultiplierIn }
}

const STAGES = [
  { min: 60, id: 'legend', accessory: '👑' },
  { min: 21, id: 'adult', accessory: '🎓' },
  { min: 7, id: 'young', accessory: '🎀' },
  { min: 1, id: 'baby', accessory: '' },
  { min: 0, id: 'egg', accessory: '' },
]

export function petState(habit, today) {
  const totalCheckins = new Set(habit.checkins).size
  const stageInfo = STAGES.find((s) => totalCheckins >= s.min)

  const todayNum = dayNum(dateKey(today))
  const set = new Set(habit.checkins)
  let health = 0
  for (let i = 0; i < 7; i++) {
    if (set.has(fromDayNum(todayNum - i))) health++
  }
  health = Math.round((health / 7) * 100)

  let mood = 'waiting'
  if (totalCheckins > 0) {
    const lastNum = Math.max(...habit.checkins.map(dayNum))
    const daysSince = todayNum - lastNum
    if (daysSince <= 0) mood = 'happy'
    else if (daysSince === 1) mood = 'waiting'
    else if (daysSince === 2) mood = 'sad'
    else mood = 'sick'
  }

  const { best } = streaks(habit.checkins, today)
  const traits = TRAITS.map((t) => ({ ...t, unlocked: best >= t.days }))

  return { stage: stageInfo.id, accessory: stageInfo.accessory, health, mood, traits }
}

export function crossedMilestone(prevBest, newBest) {
  const crossed = MILESTONES.filter((m) => prevBest < m && newBest >= m)
  return crossed.length ? crossed[crossed.length - 1] : null
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// ponytail: hand-rolled parser for a handful of English phrases (today/tomorrow/weekday,
// "5pm"/"17:30", "in Nh"/"in Nm"). Swap in chrono-node if real usage needs more coverage.
export function parseQuick(text, now) {
  let title = text.trim()
  let date = null
  let at = null

  const inMatch = title.match(/\bin\s+(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i)
  if (inMatch) {
    const n = Number(inMatch[1])
    const isHours = /^h/i.test(inMatch[2])
    at = new Date(now.getTime() + n * (isHours ? 3600000 : 60000))
    date = new Date(at.getFullYear(), at.getMonth(), at.getDate())
    title = title.replace(inMatch[0], '').trim()
    return { title, date, at }
  }

  if (/\btomorrow\b/i.test(title)) {
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    title = title.replace(/\btomorrow\b/i, '').trim()
  } else if (/\btoday\b/i.test(title)) {
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    title = title.replace(/\btoday\b/i, '').trim()
  } else {
    const wdMatch = title.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
    if (wdMatch) {
      const target = WEEKDAYS.indexOf(wdMatch[1].toLowerCase())
      const diff = (target - now.getDay() + 7) % 7
      date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
      title = title.replace(wdMatch[0], '').trim()
    }
  }

  const timeMatch = title.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (timeMatch && (timeMatch[3] || timeMatch[2])) {
    let hours = Number(timeMatch[1])
    const minutes = Number(timeMatch[2] || 0)
    const ampm = timeMatch[3]?.toLowerCase()
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
    const base = date || now
    at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes)
    if (!date) date = new Date(at.getFullYear(), at.getMonth(), at.getDate())
    title = title.replace(timeMatch[0], '').trim()
  }

  title = title.replace(/\s{2,}/g, ' ').trim()
  return { title, date, at }
}
