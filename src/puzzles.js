// Fetched from public/puzzles.json instead of bundled, so the ~108KB puzzle
// bank isn't baked into the main JS chunk for tabs that never open Puzzles.
let cached = null
export function loadPuzzles() {
  if (!cached) cached = fetch('/puzzles.json').then((r) => r.json())
  return cached
}
