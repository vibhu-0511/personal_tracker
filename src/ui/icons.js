// 24x24 line icons. Each value is one SVG path string, drawn with a 1.8 stroke,
// round caps and joins, and no fill (see Icon.jsx). Circles from the mockup
// symbols are written as arc paths so every icon is a single path string.
const circle = (cx, cy, r) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

export const icons = {
  today: `${circle(12, 12, 4)}M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4`,
  life: 'M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l8-8',
  logic: 'm9 8-4 4 4 4M15 8l4 4-4 4',
  money: 'M4 7h14a2 2 0 0 1 2 2v9H4zM4 7V6a1 1 0 0 1 1-1h11M16 13h1.5',
  invest: 'm4 18 5-6 4 3 7-9M15 6h5v5',
  agents: 'm12 4 1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z',
  plus: 'M12 5v14M5 12h14',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  note: 'M6 4h9l4 4v12H6zM14 4v5h5M9 13h6M9 16.5h4',
  check: `${circle(12, 12, 8)}m8.5 12.5 2.5 2.5 4.5-5`,
  clock: `${circle(12, 12, 8)}M12 8v4.5l3 2`,
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  repeat: 'M5 11V9a2 2 0 0 1 2-2h11l-2.5-2.5M19 13v2a2 2 0 0 1-2 2H6l2.5 2.5',
  search: `${circle(11, 11, 6)}m16 16 4 4`,
  mic: 'M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4zM7 11.5a5 5 0 0 0 10 0M12 16.5V20',
  list: 'M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01',
  up: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  face: `${circle(12, 12, 8)}M9 14.5a4 4 0 0 0 6 0M9.5 10h.01M14.5 10h.01`,
  close: 'M6 6l12 12M18 6 6 18',
}

export const ICON_NAMES = Object.keys(icons)
export default icons
