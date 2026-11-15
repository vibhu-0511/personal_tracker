import Tile from '../../ui/Tile.jsx';
import Bar from '../../ui/Bar.jsx';
import './tiles-a.css';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// Pure presentational Wallet tile (B3-11). Wallet = habit currency earned (D14).
//   loading     true while habits are hydrating (skeleton)
//   habitCount  number of habits; 0 renders the empty state
//   total       lifetime habit earnings
//   left        habits not yet checked in today
//   level       current level (never decreases, supplied by the data hook)
//   levelPct    0-100 progress to the next level
//   href/onClick  optional whole-tile navigation
export default function WalletTile({ loading = false, habitCount = 0, total = 0, left = 0, level = 1, levelPct = 0, href, onClick }) {
  const common = { tone: 'butter', title: 'Wallet', href, onClick, className: 'tla-tile' };
  if (loading) {
    return (
      <Tile {...common}>
        <div className="tla-skel" role="status" aria-label="Loading wallet" />
      </Tile>
    );
  }
  if (!habitCount) {
    return (
      <Tile {...common}>
        <p className="tla-empty">
          <span className="tla-empty-icon" aria-hidden="true">🪙</span>
          Add a habit to start earning.
        </p>
      </Tile>
    );
  }
  return (
    <Tile {...common} meta={`Lv ${level}`}>
      <div className="tla-big">
        <span className="tla-big-num">{inr(total)}</span>
      </div>
      <Bar value={levelPct} tone="success" label={`${Math.round(levelPct)}% to level ${level + 1}`} />
      <p className="tla-sub">
        {left > 0 ? `${left} check-in${left === 1 ? '' : 's'} left today` : 'All checked in today'}
      </p>
    </Tile>
  );
}
