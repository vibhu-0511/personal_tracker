// Money constants moved out of src/tabs/Expenses.jsx. Pure data, no React.

export const CATEGORIES = [
  { id: 'food', emoji: '🍔', label: 'Food' },
  { id: 'transport', emoji: '🚗', label: 'Transport' },
  { id: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { id: 'bills', emoji: '📱', label: 'Bills' },
  { id: 'entertainment', emoji: '🎮', label: 'Fun' },
  { id: 'health', emoji: '💊', label: 'Health' },
  { id: 'education', emoji: '💸', label: 'P2P' },
  { id: 'groceries', emoji: '🛒', label: 'Groceries' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'subscriptions', emoji: '🔄', label: 'Subs' },
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'other', emoji: '📦', label: 'Other' },
]

export const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

export const GOAL_ICONS = ['🏦', '🏠', '🚗', '✈️', '📱', '🎓', '💍', '🏥', '🎯', '💰']

export const MAX_AMOUNT = 10_000_000

// Same fallback the UI uses for an unknown category id.
export function categoryInfo(id) {
  return CAT_MAP[id] || { id, emoji: '📦', label: id }
}
