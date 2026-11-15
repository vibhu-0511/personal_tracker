import './ui.css';

// Keyboard hint; CSS hides it unless (hover: hover) and (pointer: fine).
export default function Kbd({ children, className = '' }) {
  return <kbd className={`ui-kbd ${className}`.trim()} aria-hidden="true">{children}</kbd>;
}
