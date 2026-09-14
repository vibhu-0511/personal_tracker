# Forge — Ideas Backlog

Uncommitted ideas from brainstorming sessions. Nothing here is scoped or approved for
implementation — this is a parking lot, not a spec. Move an idea to
`docs/superpowers/specs/` when it's actually going to be built.

---

## Pet visual growth (2026-09-14)

Context: the per-habit pet system already exists (`src/life/logic.js` `petState()`,
rendered in `src/tabs/Life.jsx`). Explored richer visuals for it; landed on deferring
in favor of a bigger idea (see below).

**Explored and rejected/parked, in order:**
1. Bigger emoji + CSS glow/bounce per growth stage (egg→baby→young→adult→legend) —
   approved as a direction, then judged "too flat" once seen live (same picture,
   different size).
2. Hand-drawn SVG creature that actually reproportions per stage (big head/stubby legs
   as baby → full adult anatomy) — liked the fidelity, but flagged as a real scope
   jump: one properly-rigged creature is a lot of hand-authored SVG; doing it for all
   7 species (🐶🐱🐰🦊🐼🐧🐉) × 5 stages is 35 illustrations, i.e. an asset pipeline,
   not a quick feature. Parked pending a decision on species scope (start with 1-3?).
3. **Current direction (superseding 1 & 2 for now):** stop building visual stages at
   all. Instead, spend ~a month just accumulating data ("count the growth of
   emotions"), then generate a 3D pet from that accumulated data at the end.

**Open questions on the "emotion tracking → 3D pet" idea (not yet answered):**
- What counts as "emotion" data? Candidates:
  - Reuse the mood the app already derives from check-in behavior
    (happy/waiting/sad/sick, see `petState()`) — zero new UI, but it's a behavior
    proxy, not a real feeling.
  - A real daily mood log the user fills in — more honest signal, but is itself a new
    habit to maintain, and adds a new data model + UI.
  - Both combined.
- What does "3D pet" actually mean feasibility-wise in a Vite+React app with no
  backend?
  - A literal WebGL/Three.js (or react-three-fiber) rendered model, generated/shaped
    procedurally from the month's data (e.g. more consistency → bigger; mood variance
    → color/texture)?
  - Or a 3D-ish effect (parallax/layered 2D, CSS 3D transforms) short of true 3D
    rendering, which would be far cheaper to build and ship?
- How exactly does 30 days of tracked data map to the pet's generated appearance? This
  needs a concrete formula, not just "based on our growth."
- Where does the accumulated data live for a month before the pet is generated — is
  this per-habit (matches current architecture) or one pool across all habits (a
  bigger change, closer to point 3 below)?

**Recommendation when this gets picked back up:** treat it as architectural (new
subsystem: data collection now, generation logic later), not bounded — get the above
questions answered and a concrete data→appearance mapping before touching code.

---

## Multiplayer + skill economy (2026-09-14)

Original 3-part idea from the user:
1. Make Forge multiplayer.
2. 200+ "skills" unlock at certain streak levels.
3. Players can fight each other; the winner takes an unlocked skill from the loser.

### Critique (asked for explicitly — not sugar-coated)

**1. Multiplayer** is a different app, not a feature. Forge has no backend today —
everything is per-browser IndexedDB, no accounts, no auth, no server. Multiplayer
requires real accounts, a shared database, sync, and (for anything real-time)
matchmaking/presence. This is bigger than every other idea in this doc combined, and
it imports new problems Forge has never had: cheating (faked streaks), moderation, and
privacy (habit data is a decent proxy for someone's mental health — do people want
that visible to strangers?).

**2. 200 skills gated by streak level** — the instinct (streak-gated unlocks) is
proven (Duolingo, Habitica), but 200 is a number that sounds impressive rather than
one that's been designed. Building and balancing 200 distinct unlocks is a huge
content burden for a solo maintainer; most apps that get this deep took years and a
community. It's also flat — one axis (streak length) for every unlock means no
player choice or branching, so progression feels the same for everyone.

It also **directly collides with the pet-runaway design built earlier today**: that
design wipes `checkins` (and the streak) after 3-4 missed days. If skills are gated on
cumulative streak/checkins too, one bad week doesn't just reset the pet — it can strip
skills earned over a month. Needs to be resolved explicitly, not discovered by a user
the hard way.

**3. PvP theft of skills — recommend cutting this entirely, not softening it:**
- Loss-aversion mechanics measurably hurt engagement in habit-formation products.
  This is why Habitica's PvP-adjacent content (boss battles, guild quests) is
  cooperative/shared-damage, never "beat a stranger, take their progress."
- **Perverse incentive:** if real progress can be stolen, the optimal play is farming
  weak/new players in PvP instead of doing your own habits — directly undermines the
  app's actual purpose.
- Mechanically unclear: a stat-comparison "fight" is a coinflip wagering real
  progress (closer to gambling than a game); an actual skill-based fight is a whole
  separate game to design and build.
- Real stakes between real users invites cheating (multi-accounts, bots) — real
  anti-cheat/moderation infra needed for what's currently a 2-person side project.

### What to keep, reframed

- **Streak-gated unlocks** — keep, but smaller and more intentional (quality over
  200).
- **Social** — keep, but start **asynchronous** (leaderboards, friend comparisons,
  opt-in visibility) rather than real-time PvP. Far less infrastructure, no
  matchmaking, no anti-cheat urgency — and it's how most successful habit apps do
  "social" in practice.
- **Fighting/dueling, without theft** — Forge already has a currency (the ₹ wallet
  earned per check-in, see `earnings()` in `logic.js`). That's the natural stake for a
  friendly duel/wager: losing some coins is recoverable, losing a month of
  streak-earned skills isn't.
- **Skills as content, not power** — reframe "skill" as unlocked *knowledge* (a
  workout routine, a study technique, a recipe) that can be **gifted or traded**
  between friends by mutual consent, never extracted by force.

### Additional ideas to consider

- **Guild/co-op challenges** — friends pool check-ins toward one shared target
  instead of competing against each other.
- **Cosmetic-only unlocks first** (pet skins, themes, titles) before anything
  stat/power-based, to avoid a broken in-game economy.
- **Trading flow** — an explicit "offer a skill" / "accept" UI, both sides opt in.

### Open questions before this becomes a real spec

- Is "multiplayer" actually required for the underlying goal (motivation, social
  accountability), or would async/social achieve most of the value at a fraction of
  the cost?
- What's a realistic skill count for a first version — 15? 30? What determines what a
  "skill" unlocks (cosmetic vs. functional vs. content)?
- How does this interact with the existing per-habit pet/streak system — one skill
  tree per user, or per habit, or per pet?
- If social/dueling ships, what's the minimum backend needed (a lightweight shared
  DB + simple auth, vs. a full multiplayer service)?

### Refinement (2026-09-14, same day): growth as a personality, not a flat list

Clarified motive: the 200 "skills" aren't meant as one flat streak-gated list — the
goal is to grow a rounded personality across real dimensions (physical, logical,
emotional, financial, and others), the way a child develops many facets at once, not
one stat.

**Why this is a stronger foundation than the original framing:** the domains map
almost exactly onto tabs Forge already has, so growth becomes a readout of real
activity instead of an invented list:
- Physical → the Exercise habit category
- Logical → Code (Codeforces) + Exams tabs
- Financial → Money (Expenses) + Invest tabs
- Emotional → meditation/journaling habit categories, and overlaps directly with the
  "emotion tracking → 3D pet" idea above — **these two should be one system, not two.**
- "Other ways" → reading, sleep, water, custom habits, Puzzles, Agents

**Still open / pushed back on, not yet resolved:**
- **200 is still probably too many**, even split across ~5 domains (40/domain is a
  huge authoring load for one person). Worth reconsidering whether *discrete
  unlockable skills* is the right shape at all — a "grow like a child" metaphor may
  fit **continuous stats** (Physical: 62, Logical: 41, Emotional: 78, rising with
  real activity) better than a 200-node skill tree, and is far less content to build.
  Not decided either way yet.

**PvP theft — decided, with mitigations (2026-09-14):**
The user considered the loss-aversion/farming/cheating risks raised above and chose
to keep theft-on-win rather than the safer "winner gets a bonus, loser loses nothing"
alternative. Confirmed mitigations to keep this from spiraling:
- **Bounded steal**: a single fight can move at most **one skill/stat point**, never
  a whole domain or a full wipe.
- **Tier-matched fights**: players can only fight others in a similar skill/level
  range, specifically to stop strong players farming beginners.

**Still unresolved even with those mitigations:**
- Nothing yet stops one player from repeatedly re-fighting the *same*
  similarly-tiered opponent to grind steals — may need a per-opponent cooldown or
  diminishing returns.
- Should any domain be exempt from theft? Emotional-domain data traces back to real
  mood/mental-health-adjacent tracking — worth considering whether that domain (as
  opposed to, say, physical or financial) should be un-stealable even if others
  aren't.
- Discrete skill-tree vs. continuous-stat question above is unresolved and changes
  what "one point" even means mechanically.
- Multiplayer infrastructure (accounts, backend, matchmaking) is still the hard
  prerequisite for any of this and hasn't been scoped.

**Explicit reminder from the user: capture only, do not start building.**
