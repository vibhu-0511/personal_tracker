import { useId } from 'react';
import './ui.css';

// tone: plain | peach | mint | butter | lilac | sky. Pass href or onClick to make
// the whole tile navigable via a real link/button on the title (stretched).
export default function Tile({ tone = 'plain', title, meta, href, onClick, children, as: Tag = 'section', className = '' }) {
  const titleId = useId();
  const interactive = !!(href || onClick);
  const heading = href
    ? <a className="ui-tile-link" href={href} onClick={onClick}>{title}</a>
    : onClick
      ? <button type="button" className="ui-tile-link" onClick={onClick}>{title}</button>
      : title;
  return (
    <Tag
      className={`ui-tile ${className}`.trim()}
      data-tone={tone}
      data-interactive={interactive ? '' : undefined}
      aria-labelledby={title ? titleId : undefined}
    >
      {(title || meta) && (
        <div className="ui-tile-head">
          {title && <h3 className="ui-tile-title" id={titleId}>{heading}</h3>}
          {meta != null && <span className="ui-tile-meta">{meta}</span>}
        </div>
      )}
      {children != null && <div className="ui-tile-body">{children}</div>}
    </Tag>
  );
}
