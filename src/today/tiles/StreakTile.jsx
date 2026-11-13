import Tile from '../../ui/Tile.jsx';
import Bar from '../../ui/Bar.jsx';
import { MILESTONES } from '../../life/logic.js';
import './tiles-a.css';

// Pure presentational Streak tile (B3-11). Props only: no store, no storage.
//   loading   true while the habits key is hydrating (renders a skeleton)
//   current   days in the current global streak (>= 1 check-in per day)
//   best      best global streak ever
//   href/onClick  optional whole-tile navigation (real link/button on the title)
// Empty state: best === 0 (nothing was ever checked in).
export default function StreakTile({ loading = false, current = 0, best = 0, href, onClick }) {
  const common = { tone: 'peach', title: 'Streak', href, onClick, className: 'tla-tile' };
  if (loading) {
    return (
      <Tile {...common}>
        <div className="tla-skel" role="status" aria-label="Loading streak" />
      </Tile>
    );
  }
  if (!best && !current) {
    return (
      <Tile {...common}>
        <p className="tla-empty">
          <span className="tla-empty-icon" aria-hidden="true">🔥</span>
          Check in a habit to start a streak.
        </p>
      </Tile>
    );
  }
  const next = MILESTONES.find((m) => m > current);
  const prev = [...MILESTONES].reverse().find((m) => m <= current) ?? 0;
  const pct = next ? ((current - prev) / (next - prev)) * 100 : 100;
  return (
    <Tile {...common} meta={`best ${best}`}>
      <div className="tla-big">
        <span aria-hidden="true">🔥</span>
        <span className="tla-big-num">{current}</span>
        <span className="tla-big-unit">{current === 1 ? 'day' : 'days'}</span>
      </div>
      <Bar
        value={pct}
        tone="warn"
        label={next ? `${current} of ${next} days to the next milestone` : 'All milestones reached'}
      />
      <p className="tla-sub">{next ? `${next - current} to ${next}-day milestone` : 'Top milestone reached'}</p>
    </Tile>
  );
}
