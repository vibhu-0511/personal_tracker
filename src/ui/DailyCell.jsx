import './ember-ui.css';

// Small bordered cell: label on top, mono value under it.
// Done adds a check glyph and a tint, so state never relies on colour alone.
// Renders a link when `href` is set, a button when `onClick` is set, else a div.
export default function DailyCell({ label, value, done = false, href, onClick, className = '', ...rest }) {
  const cls = `ember-daily ${className}`.trim();
  const state = done ? 'done' : 'open';
  const body = (
    <>
      <span className="ember-daily-label">{label}</span>
      <span className="ember-daily-value">
        {done && <span className="ember-daily-check" aria-hidden="true">✓</span>}
        <span>{value}</span>
      </span>
    </>
  );
  const common = { className: cls, 'data-state': state, ...rest };
  if (href) return <a href={href} onClick={onClick} {...common}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} {...common}>{body}</button>;
  return <div {...common}>{body}</div>;
}
