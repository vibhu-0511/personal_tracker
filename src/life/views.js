// Life view registry. Pure data, no React or DOM, so the router, the command
// palette and Life.jsx itself (and node tests) all read the same list.
//
// `path` matches the route table in src/routes.js ('/life/<id>'). `group` is the
// section the view belongs to (the old two-row pill bar's top row). `shortcut`
// is null: the shell has no per-view key binding yet, the field is reserved so
// the palette can show one once it does.
export const LIFE_VIEWS = [
  { id: 'tasks', path: '/life/tasks', label: 'Tasks', icon: '✅', group: 'planning', shortcut: null },
  { id: 'reminders', path: '/life/reminders', label: 'Reminders', icon: '⏰', group: 'planning', shortcut: null },
  { id: 'notes', path: '/life/notes', label: 'Notes', icon: '📝', group: 'planning', shortcut: null },
  { id: 'habits', path: '/life/habits', label: 'Habits', icon: '🐾', group: 'wellbeing', shortcut: null },
  { id: 'growth', path: '/life/growth', label: 'Growth', icon: '🌟', group: 'wellbeing', shortcut: null },
]

export const LIFE_GROUPS = [
  { id: 'planning', label: 'Planning', icon: '🗂️' },
  { id: 'wellbeing', label: 'Wellbeing', icon: '🌱' },
]

export const DEFAULT_LIFE_VIEW = 'tasks'

export const isLifeView = (id) => LIFE_VIEWS.some((v) => v.id === id)
