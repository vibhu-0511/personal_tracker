import Tile from '../../ui/Tile.jsx';
import Donut from '../../ui/Donut.jsx';
import Chip from '../../ui/Chip.jsx';
import './tiles-b.css';

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// Spend tile (lilac). Props only, no store access.
//   spent:       this month's spend (income excluded)
//   totalBudget: sum of category budgets; 0/undefined hides the "% of budget" line
//   categories:  [{ id, label, emoji?, total }] this month's spend per category
//   loading, href (default Money overview), monthLabel (tile meta)
export default function SpendTile({ loading = false, spent = 0, totalBudget = 0, categories = [], monthLabel, href = '#/money' }) {
  const meta = monthLabel;
  if (loading) {
    return (
      <Tile tone="lilac" title="Spend" meta={meta} href={href} className="today-tile today-tile-spend">
        <p className="tb-note" aria-busy="true">Loading spend…</p>
      </Tile>
    );
  }

  const ranked = [...categories].filter((c) => c && c.total > 0).sort((a, b) => b.total - a.total);
  if (!(spent > 0) || ranked.length === 0) {
    return (
      <Tile tone="lilac" title="Spend" meta={meta} href={href} className="today-tile today-tile-spend">
        <p className="tb-note">No spending logged this month.</p>
      </Tile>
    );
  }

  const top = ranked.slice(0, 3);
  const restTotal = ranked.slice(3).reduce((s, c) => s + c.total, 0);
  const segments = top.map((c) => ({ id: c.id, label: `${c.emoji ? `${c.emoji} ` : ''}${c.label}`, value: c.total }));
  if (restTotal > 0) segments.push({ id: '__rest', label: 'Other', value: restTotal });

  const hasBudget = totalBudget > 0;
  const pct = hasBudget ? Math.round((spent / totalBudget) * 100) : 0;

  return (
    <Tile tone="lilac" title="Spend" meta={meta} href={href} className="today-tile today-tile-spend">
      <div className="tb-spend">
        <Donut
          segments={segments}
          size={96}
          label="Spend by category"
          format={rupees}
          center={<b className="tb-spend-total">{rupees(spent)}</b>}
        />
        <div className="tb-spend-sum">
          <div className="tb-big">{rupees(spent)}</div>
          {hasBudget && (
            <div className="tb-note" data-testid="spend-budget-line">
              <Chip tone={pct > 100 ? 'hot' : pct >= 80 ? 'warn' : 'success'}>{pct}% of budget</Chip>
            </div>
          )}
        </div>
      </div>
    </Tile>
  );
}
