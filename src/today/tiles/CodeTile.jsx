import Tile from '../../ui/Tile.jsx';
import Ring from '../../ui/Ring.jsx';
import './tiles-a.css';

// Pure presentational Code ring tile (B3-11).
//   loading   true while the progress key is hydrating (skeleton)
//   solved    problems solved today
//   goal      daily target (settings.dailyGoal, default 3)
//   href/onClick  optional whole-tile navigation
// Empty state: nothing solved yet today (ring at 0 with a prompt).
export default function CodeTile({ loading = false, solved = 0, goal = 3, href, onClick }) {
  const common = { tone: 'sky', title: 'Code', href, onClick, className: 'tla-tile' };
  if (loading) {
    return (
      <Tile {...common}>
        <div className="tla-skel tla-skel-round" role="status" aria-label="Loading code progress" />
      </Tile>
    );
  }
  const g = Math.max(1, Number(goal) || 1);
  const s = Math.max(0, Number(solved) || 0);
  const pct = Math.min(100, (s / g) * 100);
  return (
    <Tile {...common}>
      <div className="tla-ring">
        <Ring value={pct} size={84} label={`${s} of ${g} solved today`}>
          <b className="tla-ring-num">{s}/{g}</b>
        </Ring>
        <p className="tla-sub">{s === 0 ? 'Solve one to start' : s >= g ? 'Goal reached' : 'solved today'}</p>
      </div>
    </Tile>
  );
}
