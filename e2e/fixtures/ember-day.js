// The fixed sample day behind the Ember mockups: Sun 15 Nov 2026, 16:18 local.
// Shapes match the real store: reminders { id, title, at, done, createdAt },
// expenses { id, amount, category, note, date, type, person }, notes as in
// Notes.jsx. All times are local, so the day reads the same in any timezone.

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime()

export const NOW = new Date(2026, 10, 15, 16, 18)
export const NOW_MS = NOW.getTime()

export const reminders = [
  { id: 'r-insurance', title: 'Renew car insurance', at: at(13, 19), done: false, createdAt: at(6, 10) },
  { id: 'r-card', title: 'Pay credit card bill', at: at(15, 9), done: true, createdAt: at(10, 20) },
  { id: 'r-gym', title: 'Gym, leg day', at: at(15, 17), done: false, createdAt: at(14, 21) },
  { id: 'r-mom', title: 'Call mom', at: at(15, 18), done: false, createdAt: at(14, 21, 5) },
  { id: 'r-cf', title: 'Codeforces Round (Div. 2)', at: at(15, 20, 5), done: false, createdAt: at(12, 12) },
  { id: 'r-dentist', title: 'Dentist check-up', at: at(16, 11), done: false, createdAt: at(11, 9) },
]

export const expenses = [
  { id: 'x-coffee', amount: 180, category: 'coffee', note: 'with Raj', date: at(15, 13, 10), type: 'expense', person: '' },
  { id: 'x-groceries', amount: 320, category: 'groceries', note: '', date: at(15, 11, 40), type: 'expense', person: '' },
  { id: 'x-transport', amount: 140, category: 'transport', note: 'auto', date: at(15, 9, 20), type: 'expense', person: '' },
  { id: 'x-dinner', amount: 890, category: 'food', note: 'dinner', date: at(14, 20, 45), type: 'expense', person: '' },
  { id: 'x-subs', amount: 360, category: 'subscriptions', note: '', date: at(14, 10), type: 'expense', person: '' },
]

export const notes = [
  {
    id: 'n-lca', createdAt: at(15, 11, 20),
    body: 'Binary lifting: LCA in O(log n)\nup[v][j] = up[up[v][j-1]][j-1]. Build in n log n.',
    tags: ['dsa'], pinned: true, color: '#6ea8fe', parentId: null,
  },
  {
    id: 'n-books', createdAt: at(8, 18),
    body: 'Books for this quarter\nDesigning Data-Intensive Applications, The Pragmatic Programmer',
    tags: ['reading'], pinned: true, color: '#c084fc', parentId: null,
  },
]

// kv_store seed for hermetic tests (see data.js KV_SEED).
export const KV_EMBER_DAY = { reminders, expenses, notes }
