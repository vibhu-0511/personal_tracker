// Research screen (ports Invest.jsx:335-409). Static screening checklists, OSS tools
// and links. No store access: the "+ Track" buttons call onTrack(type) with
// "stock" | "mf" | "ipo" so the parent decides where to go.
import { STOCK_CHECKLIST, MF_CHECKLIST, IPO_CHECKLIST, OSS_TOOLS, LINKS } from '../research.js'

function ChecklistTable({ items }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="invest-checklist">
        <thead><tr><th>Metric</th><th>Rule of thumb</th><th>Why</th><th>Where</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.metric}>
              <td>{it.metric}</td>
              <td>{it.rule}</td>
              <td className="meta">{it.why}</td>
              <td className="meta">{it.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ResearchScreen({ onTrack }) {
  const track = (type) => () => { if (onTrack) onTrack(type) }

  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="h3" style={{ marginBottom: 6 }}>How to Screen — Not What to Buy</div>
        <div className="meta">Educational criteria experienced investors use. Nothing here is a recommendation.</div>
      </div>

      <div className="section-header"><span className="section-title">Stocks</span></div>
      {STOCK_CHECKLIST.map((g) => (
        <div key={g.group} className="card" style={{ marginBottom: 8 }}>
          <div className="h3" style={{ marginBottom: 8 }}>{g.group}</div>
          <ChecklistTable items={g.items} />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={track('stock')}>
        + Track a stock
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Mutual Funds</span></div>
      <div className="card" style={{ marginBottom: 8 }}><ChecklistTable items={MF_CHECKLIST} /></div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={track('mf')}>
        + Track a fund
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">IPOs</span></div>
      <div className="card" style={{ marginBottom: 8 }}><ChecklistTable items={IPO_CHECKLIST} /></div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={track('ipo')}>
        + Track an IPO
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Open-Source Tools</span></div>
      <div className="card" style={{ marginBottom: 8 }}>
        {OSS_TOOLS.map((t) => (
          <div key={t.name} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <a href={t.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{t.name}</a>
            <div className="meta">{t.use}</div>
          </div>
        ))}
      </div>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Free Data &amp; Tools</span></div>
      <div className="card">
        {LINKS.map((l) => (
          <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 8 }}>
            <a href={l.url} target="_blank" rel="noreferrer">{l.name}</a>
            <span className="meta" style={{ textAlign: 'right' }}>{l.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
