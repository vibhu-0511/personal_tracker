import Tile from '../../ui/Tile.jsx';
import Bar from '../../ui/Bar.jsx';
import Chip from '../../ui/Chip.jsx';
import Check from '../../ui/Check.jsx';
import './tiles-a.css';

const MAX_PETS = 4;
const MOOD_TONE = { happy: 'success', waiting: 'muted', sad: 'warn', sick: 'hot' };

// Pure presentational Pets tile (B3-11).
//   loading     true while habits are hydrating (skeleton)
//   pets        [{ id, species, name, streak, stage, health (0-100), mood, checkedToday }]
//               in habit order; the first 4 are shown, the rest become a "+N" chip
//   onCheckIn   (id, nextChecked) => void. Toggles, like the Habits screen; the
//               write path (and milestone confetti) is injected by B3-13
//   moreHref    where the "+N" chip points (e.g. #/life/habits)
//   href/onClick  optional whole-tile navigation
export default function PetsTile({ loading = false, pets = [], onCheckIn, moreHref, href, onClick }) {
  const common = { tone: 'mint', title: 'Pets', href, onClick, className: 'tla-tile' };
  if (loading) {
    return (
      <Tile {...common}>
        <div className="tla-skel" role="status" aria-label="Loading pets" />
      </Tile>
    );
  }
  if (!pets.length) {
    return (
      <Tile {...common}>
        <p className="tla-empty">
          <span className="tla-empty-icon" aria-hidden="true">🥚</span>
          Add a habit to hatch your first pet.
        </p>
      </Tile>
    );
  }
  const shown = pets.slice(0, MAX_PETS);
  const more = pets.length - shown.length;
  return (
    <Tile {...common} meta={more > 0 ? (moreHref
      ? <a className="tla-more" href={moreHref}><Chip tone="muted">+{more}</Chip></a>
      : <Chip tone="muted">+{more}</Chip>) : undefined}
    >
      <ul className="tla-pets">
        {shown.map((p) => (
          <li key={p.id} className="tla-pet">
            <span className="tla-pet-face" aria-hidden="true">{p.species}</span>
            <span className="tla-pet-body">
              <span className="tla-pet-name">{p.name}</span>
              <span className="tla-pet-meta">
                {p.streak > 0 ? `${p.streak}d` : 'new'} · {p.stage}
                {p.mood && <Chip tone={MOOD_TONE[p.mood] || 'muted'}>{p.mood}</Chip>}
              </span>
              <Bar value={p.health} tone={p.health >= 50 ? 'success' : 'warn'} label={`${p.name} health`} />
            </span>
            <Check
              className="tla-check"
              checked={!!p.checkedToday}
              label={`Check in ${p.name}`}
              onChange={(next) => onCheckIn && onCheckIn(p.id, next)}
            />
          </li>
        ))}
      </ul>
    </Tile>
  );
}
