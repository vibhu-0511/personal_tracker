import './ember-ui.css';

// Pure mapping: the first `filled` of `total` squares are filled.
export function segStates(filled = 0, total = 0) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const f = Math.min(t, Math.max(0, Math.floor(Number(filled) || 0)));
  return Array.from({ length: t }, (_, i) => i < f);
}

// Row of equal squares, filled or empty. `label` overrides the default text alternative.
export default function SegDots({ filled = 0, total = 0, label, className = '', ...rest }) {
  const states = segStates(filled, total);
  const on = states.filter(Boolean).length;
  const text = label || `${on} of ${states.length} days logged`;
  return (
    <div className={`ember-segdots ${className}`.trim()} role="img" aria-label={text} {...rest}>
      {states.map((isOn, i) => (
        <span key={i} className="ember-segdot" data-filled={isOn ? 'true' : 'false'} aria-hidden="true" />
      ))}
    </div>
  );
}
