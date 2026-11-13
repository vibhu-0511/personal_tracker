import './ui.css';

// Header-style pill. Renders <a> with href, <button> with onClick, else <span>.
export default function Pill({ icon, label, onClick, href, className = '', ...rest }) {
  const cls = `ui-pill ${className}`.trim();
  const content = (
    <>
      {icon != null && <span className="ui-pill-icon" aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </>
  );
  if (href) return <a className={cls} href={href} onClick={onClick} {...rest}>{content}</a>;
  if (onClick) return <button type="button" className={cls} onClick={onClick} {...rest}>{content}</button>;
  return <span className={cls} {...rest}>{content}</span>;
}
