import Tile from '../../ui/Tile.jsx';
import { MANUAL_MOODS } from '../../life/logic.js';
import './tiles-b.css';

const MOOD_LABELS = { 0: 'Awful', 25: 'Bad', 50: 'Okay', 75: 'Good', 100: 'Great' };

// Mood tile (peach). Props only.
//   today:  today's valence (0-100) or null
//   source: 'derived' | 'logged' | undefined
//   onLog(value): called with a MANUAL_MOODS value; the host persists it
//   loading, href (default Life growth)
// Five 44px buttons need ~252px, so the tile spans the full width at 2 columns
// (see tiles-b.css).
export default function MoodTile({ loading = false, today = null, source, onLog, href = '#/life/growth' }) {
  const hint = loading
    ? 'Loading…'
    : today == null
      ? 'How are you feeling today?'
      : source === 'logged'
        ? 'Logged today'
        : "Guessed from today's check-ins. Tap to correct it.";
  return (
    <Tile tone="peach" title="Mood" href={href} className="today-tile today-tile-mood">
      <p className="tb-note" aria-busy={loading || undefined}>{hint}</p>
      <div className="tb-moods" role="group" aria-label="Log today's mood">
        {MANUAL_MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className="tb-mood-btn"
            aria-label={MOOD_LABELS[m.value] || String(m.value)}
            aria-pressed={today === m.value}
            disabled={loading}
            onClick={() => onLog && onLog(m.value)}
          >
            <span aria-hidden="true">{m.emoji}</span>
          </button>
        ))}
      </div>
    </Tile>
  );
}
