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
    console.error('puzzle handler error', e)
    res.status(502).json({ error: 'Could not fetch today\'s puzzle' })
  }
}
