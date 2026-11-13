// Primary navigation. One markup, three layouts chosen by CSS container
// queries on the app root (nav.css): bottom tabs below 600px, a 72px rail from
// 600px, a 220px labelled sidebar from 1024px. Items are plain hash links, so
// navigation, focus and aria-current work without any click handler.
import { useRoute } from '../router.js'
import { ROUTES, TAB_IDS, formatHash } from '../routes.js'

// Icons live here, not in routes.js (a pure table with no presentation).
export const NAV_ICONS = {
  today: '☀️',
  life: '🌱',
  logic: '🧠',
  money: '💰',
  invest: '📈',
  agents: '🤖',
}

// Default items: the six top-level tabs in route-table order (Today first).
export const NAV_ITEMS = TAB_IDS.map((id) => ({
  id,
  label: ROUTES[id].label,
  icon: NAV_ICONS[id] ?? '•',
}))

// `active` overrides the tab taken from the URL; `items` overrides NAV_ITEMS.
export default function Nav({ active, items = NAV_ITEMS }) {
  const route = useRoute()
  const current = active ?? route.tab
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand" aria-hidden="true">
        <span className="nav-brand-icon">🔥</span>
        <span className="nav-brand-text">Forge</span>
      </div>
      <div className="nav-list">
        {items.map((item) => (
          <a
            key={item.id}
            className="nav-item"
            href={formatHash({ tab: item.id })}
            aria-current={item.id === current ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
