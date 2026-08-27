export default async function handler(req, res) {
  try {
    const r = await fetch('https://lichess.org/api/puzzle/daily')
    if (!r.ok) throw new Error(`Lichess responded ${r.status}`)
    const { puzzle } = await r.json()
    res.status(200).json({
      id: puzzle.id,
      rating: puzzle.rating,
      themes: puzzle.themes || [],
      url: `https://lichess.org/training/${puzzle.id}`,
    })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
