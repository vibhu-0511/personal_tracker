import { useEffect, useState } from 'react';
import Tile from './Tile.jsx';
import Row from './Row.jsx';
import Check from './Check.jsx';
import Chip from './Chip.jsx';
import Pill from './Pill.jsx';
import Stat from './Stat.jsx';
import EmptyState from './EmptyState.jsx';
import Bar from './Bar.jsx';
import Ring from './Ring.jsx';
import Donut from './Donut.jsx';
import Spark from './Spark.jsx';

const THEMES = ['ocean', 'forest', 'sunset', 'grape', 'rose', 'sky', 'cream'];
const WIDTHS = [
  { id: 'phone', label: 'Phone 390', px: 390 },
  { id: 'tablet', label: 'Tablet 768', px: 768 },
  { id: 'desktop', label: 'Desktop 1200', px: 1200 },
];
const TONES = ['plain', 'peach', 'mint', 'butter', 'lilac', 'sky'];
const SEGMENTS = [
  { id: 'rent', label: 'Rent', value: 1200 },
  { id: 'food', label: 'Food', value: 450 },
  { id: 'fun', label: 'Fun', value: 220 },
  { id: 'misc', label: 'Misc', value: 130 },
];

function Section({ title, children }) {
  return (
    <section className="gal-section">
      <h3 className="gal-h2">{title}</h3>
      <div className="gal-stack">{children}</div>
    </section>
  );
}

function Primitives() {
  const [checks, setChecks] = useState({ a: true, b: false });
  const [selected, setSelected] = useState('one');
  return (
    <>
      <Section title="Tile">
        {TONES.map((tone) => (
          <Tile key={tone} tone={tone} title={`Tile ${tone}`} meta="meta">
            Body text on the {tone} tone.
          </Tile>
        ))}
        <Tile tone="mint" title="Interactive tile" href="#gallery" meta="link">Whole tile is a link.</Tile>
        <Tile tone="lilac" title="Button tile" onClick={() => {}}>Whole tile is a button.</Tile>
      </Section>

      <Section title="Row">
        <ul className="gal-list">
          <Row lead={<Check checked={checks.a} onChange={(v) => setChecks((c) => ({ ...c, a: v }))} label="Toggle item" />} title="Plain row" sub="With sub text" trail={<Chip>trail</Chip>} />
          <Row selected={selected === 'one'} onSelect={() => setSelected('one')} title="Selectable row (one)" sub="Button title" />
          <Row selected={selected === 'two'} onSelect={() => setSelected('two')} title="Selectable row (two)" sub="Click to select" />
          <Row done title="Done row" sub="Struck through" lead={<Check checked label="Done" />} />
          <Row dense title="Dense row" trail={<Pill label="12" />} />
          <Row dense title="Dense row with spark" trail={<Spark points={[3, 5, 4, 8, 7, 9]} />} />
        </ul>
      </Section>

      <Section title="Check">
        <div className="gal-inline">
          {['success', 'accent', 'warn', 'danger'].map((tone) => (
            <Check key={tone} tone={tone} checked={checks.b} onChange={(v) => setChecks((c) => ({ ...c, b: v }))} label={`Check ${tone}`} />
          ))}
          <Check checked label="Checked" />
          <Check label="Unchecked" />
        </div>
      </Section>

      <Section title="Chip">
        <div className="gal-inline">
          {['default', 'muted', 'hot', 'success', 'warn'].map((tone) => (
            <Chip key={tone} tone={tone}>{tone}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Pill">
        <div className="gal-inline">
          <Pill icon="🔥" label="12 day streak" />
          <Pill icon="⚡" label="Button pill" onClick={() => {}} />
          <Pill icon="↗" label="Link pill" href="#gallery" />
          <Pill label="No icon" />
        </div>
      </Section>

      <Section title="Stat">
        <div className="gal-inline">
          <Stat label="Default" value="42" />
          <Stat label="Accent" value="7" tone="accent" />
          <Stat label="Success" value="98%" tone="success" />
          <Stat label="Warn" value="3" tone="warn" />
          <Stat label="Danger" value="-5" tone="danger" />
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState icon="🌱" text="Nothing here yet." />
        <EmptyState icon="📭" text="No items match." action={{ label: 'Add one', onClick: () => {} }} />
      </Section>

      <Section title="Bar">
        {['default', 'success', 'warn', 'danger'].map((tone, i) => (
          <Bar key={tone} tone={tone} value={25 * (i + 1) - 10} label={`Bar ${tone}`} />
        ))}
        <Bar value={0} label="Empty bar" />
        <Bar value={100} label="Full bar" />
      </Section>

      <Section title="Ring">
        <div className="gal-inline">
          <Ring value={0} label="Zero" />
          <Ring value={66} label="2 of 3 solved today"><b>2/3</b></Ring>
          <Ring value={100} size={64} label="Complete"><b>✓</b></Ring>
        </div>
      </Section>

      <Section title="Donut">
        <Donut segments={SEGMENTS} label="Spending" center={<b>2,000</b>} format={(n) => `$${n}`} />
        <Donut segments={[]} label="Empty" />
      </Section>

      <Section title="Spark">
        <div className="gal-inline">
          <Spark points={[1, 3, 2, 5, 4, 7, 6, 9]} />
          <Spark points={[9, 7, 8, 4, 5, 2, 3, 1]} tone="danger" />
          <Spark points={[]} />
          <Spark points={[2, 2, 2, 2]} width={96} height={32} />
        </div>
      </Section>
    </>
  );
}

const CSS = `
.gal-page { padding: 16px; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--font-ui); }
.gal-bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 12px; margin-bottom: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.gal-bar h1 { font-size: 16px; margin: 0 8px 0 0; }
.gal-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.gal-group > span { font-size: 12px; color: var(--text-secondary); }
.gal-btn { font: inherit; font-size: 13px; padding: 6px 10px; border-radius: var(--radius-xs); border: 1px solid var(--border-light); background: transparent; color: var(--text); cursor: pointer; }
.gal-btn[aria-pressed="true"] { background: var(--accent-solid); border-color: var(--accent-solid); color: var(--on-accent); }
.gal-frames { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
.gal-frame { max-width: 100%; border: 1px dashed var(--border-light); border-radius: var(--radius-sm); padding: 12px; overflow-x: auto; }
.gal-cap { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.gal-section { margin-bottom: 20px; }
.gal-h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-secondary); margin: 0 0 8px; }
.gal-stack { display: flex; flex-direction: column; gap: 10px; }
.gal-inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.gal-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
`;

export default function Gallery() {
  const [theme, setTheme] = useState('ocean');
  const [widths, setWidths] = useState(['phone']);

  useEffect(() => {
    document.documentElement.dataset.accent = theme;
  }, [theme]);

  const toggle = (id) =>
    setWidths((w) => (w.includes(id) ? (w.length > 1 ? w.filter((x) => x !== id) : w) : [...w, id]));
  const shown = WIDTHS.filter((w) => widths.includes(w.id));

  return (
    <div className="gal-page" id="gallery">
      <style>{CSS}</style>
      <header className="gal-bar">
        <h1>Forge UI gallery</h1>
        <div className="gal-group" role="group" aria-label="Theme">
          <span>Theme</span>
          {THEMES.map((t) => (
            <button key={t} type="button" className="gal-btn" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>
        <div className="gal-group" role="group" aria-label="Width">
          <span>Width</span>
          {WIDTHS.map((w) => (
            <button key={w.id} type="button" className="gal-btn" aria-pressed={widths.includes(w.id)} onClick={() => toggle(w.id)}>{w.label}</button>
          ))}
        </div>
      </header>
      <main className="gal-frames">
        {shown.map((w) => (
          <div key={w.id} className="gal-frame" style={{ width: w.px }}>
            <h2 className="gal-cap">{w.label}px</h2>
            <Primitives />
          </div>
        ))}
      </main>
    </div>
  );
}
