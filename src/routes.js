// Route table and pure path parse/format helpers. No React, no DOM: this file is
// location-agnostic (it only deals with "/tab/view" style paths and the "#/..."
// hash form of them) so it can be unit-tested in node and reused by any router
// backend (hash today, history API later).
//
// Tab ids are URL slugs (lowercase), distinct from the legacy component-state
// ids used in App.jsx ('Life', 'LogicBuilding', 'Expenses', ...); `legacyId`
// maps between them for the wiring wave.

export const DEFAULT_TAB = 'today'

// `views`: allowed sub-view ids for the tab, in display order. Tabs without
// sub-views (today, agents) have an empty list.
export const ROUTES = {
  today: { id: 'today', label: 'Today', legacyId: 'Today', views: [] },
  life: {
    id: 'life', label: 'Life', legacyId: 'Life',
    views: ['tasks', 'reminders', 'notes', 'habits', 'growth'],
  },
  logic: {
    id: 'logic', label: 'Logic', legacyId: 'LogicBuilding',
    views: ['code', 'puzzles', 'exams'],
  },
  // Money uses the merged 4-view layout (budget + goals folded into one view).
  money: {
    id: 'money', label: 'Money', legacyId: 'Expenses',
    views: ['overview', 'txns', 'budget', 'loans'],
  },
  invest: {
    id: 'invest', label: 'Invest', legacyId: 'Invest',
    views: ['learn', 'research', 'watch'],
  },
  agents: { id: 'agents', label: 'Agents', legacyId: 'Agents', views: [] },
}

export const TAB_IDS = Object.keys(ROUTES)

export function isTab(tab) {
  return typeof tab === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, tab)
}

export function isView(tab, view) {
  return isTab(tab) && typeof view === 'string' && ROUTES[tab].views.includes(view)
}

export function defaultView(tab) {
  return isTab(tab) ? ROUTES[tab].views[0] ?? null : null
}

export function tabFromLegacyId(legacyId) {
  return TAB_IDS.find((t) => ROUTES[t].legacyId === legacyId) ?? null
}

// Accepts '#/life/tasks', '/life/tasks', 'life/tasks', with optional trailing
// slash or query string. Returns { tab, view } where `view` is null when absent
// or not in the table. Unknown tabs fall back to the default tab.
export function parsePath(input) {
  let s = typeof input === 'string' ? input : ''
  s = s.replace(/^#/, '').split('?')[0]
  const [rawTab, rawView] = s.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p).toLowerCase() } catch { return p.toLowerCase() }
  })
  if (!isTab(rawTab)) return { tab: DEFAULT_TAB, view: null }
  return { tab: rawTab, view: isView(rawTab, rawView) ? rawView : null }
}

// Canonical path for a route, e.g. '/life/tasks'. An unknown tab becomes the
// default tab and an invalid/missing view is dropped.
export function formatPath({ tab, view } = {}) {
  const t = isTab(tab) ? tab : DEFAULT_TAB
  return isView(t, view) ? `/${t}/${view}` : `/${t}`
}

export const parseHash = parsePath
export const formatHash = (route) => `#${formatPath(route)}`
