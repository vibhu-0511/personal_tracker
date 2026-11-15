import { icons } from './icons.js'

// Line icon. Decorative (aria-hidden) unless a `label` is given, in which case
// it is exposed as an image with that name. Colour comes from currentColor.
export default function Icon({ name, size = 20, label, className = '', ...rest }) {
  const d = icons[name]
  if (!d) return null
  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true', focusable: 'false' }
  return (
    <svg
      className={className || undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...a11y}
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}
