import Tile from '../../ui/Tile.jsx';
import Row from '../../ui/Row.jsx';
import Check from '../../ui/Check.jsx';
import Chip from '../../ui/Chip.jsx';
import './tiles-a.css';

const MAX_TASKS = 4;

// Same quadrant vocabulary as the Tasks screen; plain tasks get no chip.
function quadrantChip(t) {
  if (t.urgent && t.important) return { label: 'Urgent', tone: 'hot' };
  if (t.important) return { label: 'Important', tone: 'default' };
  if (t.urgent) return { label: 'Not important', tone: 'muted' };
  return null;
}

// Overdue, due today, urgent+important, then the rest. Stable; does not mutate.
function rank(t, todayKey) {
  if (t.due && t.due < todayKey) return 0;
  if (t.due && t.due === todayKey) return 1;
  if (t.urgent && t.important) return 2;
  return 3;
}
export function pickTasks(tasks, todayKey, max = MAX_TASKS) {
  return tasks
    .map((t, i) => ({ t, i, r: rank(t, todayKey) }))
    .filter(({ t }) => !t.done)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map(({ t }) => t);
}

function dueChip(t, todayKey) {
  if (!t.due) return null;
  if (t.due < todayKey) return <Chip tone="hot">Overdue</Chip>;
  if (t.due === todayKey) return <Chip tone="warn">Today</Chip>;
  return <Chip tone="muted">{t.due}</Chip>;
}

// Pure presentational Tasks tile (B3-11).
//   loading       true while the tasks key is hydrating (skeleton)
//   tasks         [{ id, title, due ('YYYY-MM-DD'), done, urgent, important }]
//   todayKey      'YYYY-MM-DD' for overdue / today labels
//   onToggleTask  (id, nextDone) => void. The write path is injected by B3-13
//   href/onClick  optional whole-tile navigation
export default function TasksTile({ loading = false, tasks = [], todayKey = '', onToggleTask, href, onClick }) {
  const common = { tone: 'plain', title: 'Tasks', href, onClick, className: 'tla-tile' };
  if (loading) {
    return (
      <Tile {...common}>
        <div className="tla-skel" role="status" aria-label="Loading tasks" />
      </Tile>
    );
  }
  const open = tasks.filter((t) => !t.done);
  if (!open.length) {
    return (
      <Tile {...common}>
        <p className="tla-empty">
          <span className="tla-empty-icon" aria-hidden="true">✅</span>
          {tasks.length ? 'All done. Nothing open.' : 'No tasks yet.'}
        </p>
      </Tile>
    );
  }
  const shown = pickTasks(tasks, todayKey);
  const more = open.length - shown.length;
  return (
    <Tile {...common} meta={`${open.length} open`}>
      <ul className="tla-tasks">
        {shown.map((t) => {
          const q = quadrantChip(t);
          return (
            <Row
              key={t.id}
              dense
              className="tla-task"
              lead={
                <Check
                  className="tla-check"
                  checked={false}
                  label={`Complete ${t.title}`}
                  onChange={(next) => onToggleTask && onToggleTask(t.id, next)}
                />
              }
              title={t.title}
              trail={<>{q && <Chip tone={q.tone}>{q.label}</Chip>}{dueChip(t, todayKey)}</>}
            />
          );
        })}
      </ul>
      {more > 0 && <p className="tla-sub">+{more} more</p>}
    </Tile>
  );
}
