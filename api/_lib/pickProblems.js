const DEFAULT_RATING = 1200
const BAND = 400

export function pickProblems(problems, rating, solvedIds, { limit = 20, offset = 0, ratingMin, ratingMax, tags } = {}) {
  const center = typeof rating === 'number' ? rating : DEFAULT_RATING
  const lo = typeof ratingMin === 'number' ? ratingMin : center - BAND
  const hi = typeof ratingMax === 'number' ? ratingMax : center + BAND

  let pool = problems
    .filter((p) => typeof p.rating === 'number')
    .filter((p) => p.rating >= lo && p.rating <= hi)
    .filter((p) => !solvedIds.has(`${p.contestId}${p.index}`))

  if (tags && tags.length > 0) {
    pool = pool.filter((p) => tags.every((t) => (p.tags || []).includes(t)))
  }

  const sorted = pool.sort((a, b) => a.rating - b.rating)
  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    hasMore: offset + limit < sorted.length,
  }
}
