import SpendScreen from './screens/SpendScreen.jsx'
import BudgetsScreen from './screens/BudgetsScreen.jsx'
import GoalsScreen from './screens/GoalsScreen.jsx'
import LoansScreen from './screens/LoansScreen.jsx'

// Money screen registry (D8: four merged views). Every Component must render
// inside <MoneyProvider> (MoneyApp mounts it; a shell that renders screens
// directly has to wrap them itself). MoneyApp imports this file, so it is not
// re-exported here (that would be an import cycle).
export const MONEY_SCREENS = [
  { id: 'spend', label: 'Spend', icon: '📊', Component: SpendScreen },
  { id: 'budgets', label: 'Budgets', icon: '📐', Component: BudgetsScreen },
  { id: 'goals', label: 'Goals', icon: '🎯', Component: GoalsScreen },
  { id: 'loans', label: 'Loans', icon: '🤝', Component: LoansScreen },
]
