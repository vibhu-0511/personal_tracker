export async function fireConfetti() {
  const confetti = (await import('canvas-confetti')).default
  confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, disableForReducedMotion: true })
}
