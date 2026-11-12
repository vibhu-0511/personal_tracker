# Open decisions

Each has a default so the plan never blocks. Change the Status cell to `confirmed` or write your answer; then re-run `node scripts/plan/plan-synthesize.mjs` if it changes the plan.

| # | Decision | Default | Affects | Status |
|---|---|---|---|---|
| D1 | Router: hash URLs (#/life/tasks) or path URLs (/life/tasks)? | Hash. No host rewrite, works unchanged in Capacitor. The router API stays stable so switching later is cheap. | P0 router (R1-04) | default assumed |
| D2 | Level/XP rule for the Today header: can Level ever go down? | Derived from wallet earnings plus completed tasks; never decreases. | P1 R2-02, ADR B1-05 | default assumed |
| D3 | Habits and Growth: A-style dense rows or B-style pet tiles? | A rows (R2-13). B tile grid (B3-20) is deferred. | P1 R2-13/R2-14 | default assumed |
| D4 | Money: 4 sub-views (Overview+Txns merged into Spend) or keep 5? | 4 (merged), as the blueprint shows. | P1 R4-05 | default assumed |
| D5 | Inspector pane starts at 1024px (your decision) or 1280px (blueprint table)? | 1024px. | P0 R1-06 | default assumed |
| D6 | Reminders: recurrence (Daily/Monthly) and a notes title field - in scope? | Out of scope for now; the model has neither. | P1 R2-11/R2-12 | default assumed |
| D7 | Daily code goal and what "solved today" counts? | Goal 3, manual solves only (as today). Real Codeforces submissions can follow. | P1 R3-08 | default assumed |
| D8 | DSA map: iframe route with ?embed=1, or port to React? | Iframe at #/logic/dsa with a new-tab fallback. | P1 R3-03/R3-04 | default assumed |
| D9 | Owner-gate /api/cf and /api/quote like /api/agent? | Yes - gate both; apiFetch already sends the token. | P2 R5-04 | default assumed |
| D10 | Production GROQ_MODEL (code default openai/gpt-oss-120b; README says a retired llama model)? | Keep the code default; fix .env.example and README. | P2 R5-18 | default assumed |
| D11 | Should Vercel Preview deploys use a separate Supabase project? | Yes, otherwise previews write real data. | P2 R7-14 | default assumed |
| D12 | PWA icon artwork: approve the generated flame on #0a0c10 or supply your own. | Ship the generated icon first. | P2 R7-03 | default assumed |
| D13 | Your devices and iOS versions; do you have a Mac with Xcode 26+ and an Apple Developer account; Vercel plan and region. | Unknown - needed before P4. Without a Mac, P4 cannot be built. | P2/P4 | default assumed |
| D14 | What does "wallet" mean: habit currency, real spend, or both? | Habit currency (earnings from check-ins) in the header; money spend stays in Money. | P1 B3-12/B3-13 | default assumed |
| D15 | Cream theme synced across devices (in settings) or per-device? | Synced (stored in settings). | P0 R1-09 | default assumed |
| D16 | Sync v2 cutover: approve running the SQL and backfill on the live Supabase project, and who runs the keep-alive. | Approval required at the time; backup table first; per-key flags and rollback. Keep-alive via Vercel cron. | P3 R6-16/R6-17, P5 X1-08 | default assumed |
| D17 | Where do Pencil drawings live? | A separate synced collection, never inside notes (IDEAS.md reasoning). | P4 R2-19 | default assumed |
