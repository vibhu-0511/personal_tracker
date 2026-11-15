// Level/XP derived from data that already exists (habit earnings + done tasks).
// Pure: no DOM, no storage, no stored XP key. See docs/adr/0004-level-xp.md
// (status: Proposed, not yet user-approved). Tune the constants below.

import { earnings } from './logic.js'

// Level n starts at LEVEL_BASE * (n - 1)^2 XP. Level 1 starts at 0.
export const LEVEL_BASE = 30
// XP granted for each completed task.
export const TASK_XP = 10

// Total XP: sum of habit wallet earnings plus TASK_XP per done task.
// Earnings carry streak multipliers (e.g. 1.25), so the result is rounded down
// to an integer.
export function xpFor(habits, tasks, now) {
  const earned = (habits || []).reduce((sum, h) => sum + earnings(h, now).total, 0)
  const doneTasks = (tasks || []).filter((t) => t && t.done === true).length
  return Math.floor(earned + TASK_XP * doneTasks)
}

// Level from XP. Pass highWater (the highest XP ever shown) so the level
// never decreases: the level is read from max(xp, highWater).
// Returns { level, into, needed, pct } where `into` is XP past this level's
// start, `needed` is XP from this level's start to the next, pct is 0-99.
export function levelFromXp(xp, highWater = 0) {
  const effective = Math.max(0, Math.floor(Math.max(Number(xp) || 0, Number(highWater) || 0)))
  const level = Math.floor(Math.sqrt(effective / LEVEL_BASE)) + 1
  const start = LEVEL_BASE * (level - 1) ** 2
  const needed = LEVEL_BASE * (2 * level - 1)
  const into = effective - start
  const pct = Math.floor((100 * into) / needed)
  return { level, into, needed, pct }
}
