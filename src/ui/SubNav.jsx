import { useEffect, useRef } from 'react';
import './subnav.css';

// Route-driven sub-view pills (replaces .agent-bar + .agent-pill).
// items: [{ id, label, icon?, href? }]. `value` is the active id.
// An item with `href` renders a real <a> (aria-current="page" when active), so
// navigation, focus and middle-click work without JS. Items without `href`
// render <button>s that call onChange(id) (aria-current is still set).
// The bar scrolls horizontally with no visible scrollbar and keeps the active
// pill in view; only the bar scrolls, never the page.
export default function SubNav({ items, value, onChange, label = 'Sections', className = '', ...rest }) {
  const barRef = useRef(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const active = bar.querySelector('[aria-current]');
    if (!active) return;
    const left = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    const max = bar.scrollWidth - bar.clientWidth;
    if (max <= 0) return;
    const behavior = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
    bar.scrollTo({ left: Math.max(0, Math.min(max, left)), behavior });
  }, [value, items]);

  return (
    <nav className={`ui-subnav ${className}`.trim()} aria-label={label} ref={barRef} {...rest}>
      {items.map((item) => {
        const current = item.id === value ? 'page' : undefined;
        const content = (
          <>
            {item.icon != null && <span className="ui-subnav-icon" aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
          </>
        );
        if (item.href) {
          return (
            <a key={item.id} className="ui-subnav-pill" href={item.href} aria-current={current}
              onClick={onChange ? () => onChange(item.id) : undefined}>
              {content}
            </a>
          );
        }
        return (
          <button key={item.id} type="button" className="ui-subnav-pill" aria-current={current}
            onClick={onChange ? () => onChange(item.id) : undefined}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
