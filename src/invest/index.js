import LearnScreen from './screens/LearnScreen.jsx'
import ResearchScreen from './screens/ResearchScreen.jsx'
import WatchScreen from './screens/WatchScreen.jsx'

// Disclaimer shown above every Invest screen (from tabs/Invest.jsx:61-63).
export const INVEST_DISCLAIMER =
  'Educational only — not SEBI-registered investment advice. No buy/sell recommendations.'

// Invest screen registry: the shell renders one pill per entry, in order.
export const INVEST_SCREENS = [
  { id: 'learn', icon: '📘', label: 'Learn', Component: LearnScreen },
  { id: 'research', icon: '🔍', label: 'Research', Component: ResearchScreen },
  { id: 'watch', icon: '⭐', label: 'Watchlist', Component: WatchScreen },
]

export const DEFAULT_INVEST_SCREEN = 'learn'
