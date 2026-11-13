// GrowthInspector: per-domain breakdown for the Growth screen (R2-14).
//
//   <GrowthInspector domain habits stat onClose />
//
// Rendered by Growth.jsx in the MasterDetail inspector pane from 1024px. Lists the habits
// that feed the selected domain's bar and the domain's titles.
import { DOMAINS } from '../logic.js'
import { domainBreakdown, domainTitles } from '../growth.js'

export default function GrowthInspector({ domain, habits, stat, onClose }) {
  const label = DOMAINS.find((d) => d.id === domain)?.label ?? domain
  const rows = domainBreakdown(habits, domain)
  const total = rows.reduce((sum, r) => sum + r.points, 0)
  const titles = domainTitles(domain, stat)

  return (
    <div className="growth-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="life-section-label" style={{ flex: 1, margin: 0 }}>{label}</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">Close</button>
        )}
      </div>

      <div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{stat}<span className="meta"> / 100</span></div>
        {total > stat && <div className="meta">{total} points earned, capped at 100</div>}
      </div>

      <div>
        <div className="h3" style={{ marginBottom: 6 }}>Where it comes from</div>
        {rows.length === 0 ? (
          <div className="meta">No check-ins in this domain yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 4 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span className="meta">{r.checkins} check-in{r.checkins === 1 ? '' : 's'} · {r.points} pts</span>
            </div>
          ))
        )}
      </div>

      <div>
        <div className="h3" style={{ marginBottom: 6 }}>Titles</div>
        <div className="habit-traits">
          {titles.map((t) => (
            <span key={t.at} className={`habit-trait${t.unlocked ? ' unlocked' : ''}`}>
              {t.unlocked ? '✓ ' : '🔒 '}{t.label} ({t.at})
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
