// Growth helpers (R2-14): pure functions behind the Growth inspector.
//
// logic.js owns the scoring (computeStats); this module only explains it. Points use the same
// rule as computeStats (2 per unique check-in, unknown domain counts as 'other') so a
// breakdown always adds up to the stat before the 100 cap is applied.
import { DOMAINS, TITLES } from './logic.js'

const POINTS_PER_CHECKIN = 2

function domainKey(habit) {
  return DOMAINS.some((d) => d.id === habit.domain) ? habit.domain : 'other'
}

// Habits that contribute to `domain`, highest points first (ties keep list order).
// Habits with no check-ins contribute nothing and are left out.
export function domainBreakdown(habits, domain) {
  return habits
    .filter((h) => domainKey(h) === domain)
    .map((h) => {
      const checkins = new Set(h.checkins).size
      return { id: h.id, name: h.name, checkins, points: checkins * POINTS_PER_CHECKIN }
    })
    .filter((row) => row.points > 0)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.points - a.row.points || a.index - b.index)
    .map(({ row }) => row)
}

// Titles for one domain with an `unlocked` flag, given that domain's capped stat.
export function domainTitles(domain, stat) {
  return TITLES.filter((t) => t.domain === domain).map((t) => ({ ...t, unlocked: stat >= t.at }))
}
