// Home ("Today" in the nav). Stub until the Today dashboard lands; the tab id is
// `Home` because `Today` is already the Codeforces progress key (see App.jsx).
// `syncTick` is bumped when a remote change touches data Home will show.
export default function Home({ syncTick = 0 }) {
  return (
    <section className="card" data-sync-tick={syncTick} aria-labelledby="home-title">
      <div className="h3" id="home-title">Today</div>
      <p className="meta" style={{ marginTop: 6 }}>Your day at a glance will show up here.</p>
    </section>
  )
}
