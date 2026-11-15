// Home ("Today" in the nav). The tab id is `Home` because `Today` is already the
// Codeforces progress key (see App.jsx). `syncTick` is bumped when a remote
// change touches data Home shows; TodayHome re-reads silently on it.
import TodayHome from '../today/TodayHome.jsx'

export default function Home({ syncTick = 0 }) {
  return <TodayHome syncTick={syncTick} />
}
