const BAND = 200
const DEFAULT_RATING = 1200

export function pickProblems(problems, rating, solvedIds, limit = 20) {
  const center = typeof rating === 'number' ? rating : DEFAULT_RATING
  return problems
    .filter((p) => typeof p.rating === 'number')
    .filter((p) => p.rating >= center - BAND && p.rating <= center + BAND)
    .filter((p) => !solvedIds.has(`${p.contestId}${p.index}`))
    .sort((a, b) => a.rating - b.rating)
    .slice(0, limit)
}
