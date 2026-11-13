// Top bar: page title on the left, an `children` slot for actions on the
// right (settings, palette trigger, ...). The phone layout also shows the
// brand mark because the bottom tabs have no room for it; the rail and
// sidebar carry the brand themselves.
export default function TopBar({ title, children }) {
  return (
    <header className="topbar">
      <div className="topbar-lead">
        <span className="topbar-brand" aria-hidden="true">🔥</span>
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-actions">{children}</div>
    </header>
  )
}
