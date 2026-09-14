// Learning course content: 19 modules, sequential unlock, 80%-to-pass quizzes.
// Adapted from personal/trading_tutor.html (India-focused, educational only).
// CONTENT values are hand-written HTML strings (never user input) rendered via
// dangerouslySetInnerHTML in Invest.jsx.

export const PHASES = [
  { id: 'p1', name: 'PH1 · Foundations', mods: [
    { id: 'm1', t: 'What Markets Actually Are', meta: 'Phase 1 · ~45 min · No real money', body: 'foundations' },
    { id: 'm2', t: 'Risk, Return & Compounding', meta: 'Phase 1 · ~40 min · No real money', body: 'risk' },
    { id: 'm3', t: 'Account Setup (Demat/Broker)', meta: 'Phase 1 · ~30 min · India', body: 'setup' },
  ] },
  { id: 'p2', name: 'PH2 · Investing', mods: [
    { id: 'm4', t: 'Index Funds & ETFs', meta: 'Phase 2 · ~45 min · Paper', body: 'index' },
    { id: 'm5', t: 'Asset Allocation & SIP', meta: 'Phase 2 · ~40 min · Paper', body: 'alloc' },
    { id: 'm6', t: 'Reading a Company', meta: 'Phase 2 · ~50 min · Paper', body: 'fundamentals' },
    { id: 'm7', t: 'Tax for Indian Investors', meta: 'Phase 2 · ~35 min · India', body: 'tax' },
    { id: 'm17', t: 'Choosing Mutual Funds', meta: 'Phase 2 · ~40 min · Paper', body: 'mfSelect' },
    { id: 'm18', t: 'Evaluating IPOs', meta: 'Phase 2 · ~40 min · Paper', body: 'ipoEval' },
    { id: 'm19', t: 'Portfolio Review & Staying Safe', meta: 'Phase 2 · ~30 min · Ongoing', body: 'review' },
  ] },
  { id: 'p3', name: 'PH3 · Go Live', mods: [
    { id: 'm8', t: 'Your First Real SIP', meta: 'Phase 3 · REAL MONEY · small', body: 'live' },
  ] },
  { id: 'p4', name: 'PH4 · Technicals', mods: [
    { id: 'm9', t: 'Candlesticks Decoded', meta: 'Phase 4 · ~50 min · Paper', body: 'candles' },
    { id: 'm10', t: 'S/R, Trend & Volume', meta: 'Phase 4 · ~45 min · Paper', body: 'sr' },
    { id: 'm11', t: 'Indicators (RSI/MACD/MA)', meta: 'Phase 4 · ~50 min · Paper', body: 'indicators' },
  ] },
  { id: 'p5', name: 'PH5 · Trade Mechanics', mods: [
    { id: 'm12', t: 'Orders, Sizing & Stop-Loss', meta: 'Phase 5 · ~45 min · Paper', body: 'orders' },
    { id: 'm13', t: 'Risk:Reward & Expectancy', meta: 'Phase 5 · ~40 min · Paper', body: 'expectancy' },
  ] },
  { id: 'p6', name: 'PH6 · Strategies', mods: [
    { id: 'm14', t: 'Swing / Momentum / Mean-Rev', meta: 'Phase 6 · ~55 min · Paper→tiny', body: 'strats' },
  ] },
  { id: 'p7', name: 'PH7 · Advanced', mods: [
    { id: 'm15', t: 'Options & Greeks (Intro)', meta: 'Phase 7 · CAREFUL · optional', body: 'options' },
  ] },
  { id: 'p8', name: 'PH8 · Mind', mods: [
    { id: 'm16', t: 'Psychology & Why Most Lose', meta: 'Phase 8 · throughout', body: 'psych' },
  ] },
]

export const CONTENT = {
  foundations: `<div class="card"><h3>Core Idea</h3>
 <p>A <strong>stock market</strong> is a public auction. Companies sell slices of ownership (<strong>shares/equity</strong>); buyers and sellers continuously negotiate the price. India's two big exchanges: <strong>NSE</strong> (Nifty 50 index) and <strong>BSE</strong> (Sensex index).</p>
 <h4>The building blocks</h4>
 <table><tr><th>Instrument</th><th>What you own</th><th>Risk</th></tr>
 <tr><td>Stock/Share</td><td>Slice of one company</td><td>High</td></tr>
 <tr><td>Bond</td><td>A loan you gave (they pay interest)</td><td>Low–Med</td></tr>
 <tr><td>Mutual Fund</td><td>A basket, run by a manager</td><td>Varies</td></tr>
 <tr><td>ETF</td><td>A basket that trades like a stock</td><td>Varies</td></tr>
 <tr><td>F&amp;O</td><td>A bet on price/direction (derivative)</td><td>Extreme</td></tr></table>
 <div class="eg"><b>EG ›</b> You buy 1 share of Reliance at ₹2,800. You now own ~1/6,760,000,000th of the company. If profits rise, demand for the share rises, price rises. You earn via (1) price appreciation, (2) dividends.</div>
 <h4>How a trade happens</h4>
 <ul><li>You place an <span class="kbd">order</span> via a broker (Zerodha, Groww, etc.)</li>
 <li>The exchange's <strong>order book</strong> matches your buy to someone's sell</li>
 <li><strong>Bid</strong> = highest price buyers offer · <strong>Ask</strong> = lowest sellers accept · gap = <strong>spread</strong></li></ul>
 <div class="warn"><b>MYTH ›</b> "Stock price = company value." No. Price = last agreed transaction. It's emotional, reflexive, and often wrong short-term.</div></div>`,

  risk: `<div class="card"><h3>The Only Free Lunch: Compounding</h3>
 <p>Money grows on money. ₹10,000 at 12%/yr isn't +₹1,200 forever — each year grows the new total.</p>
 <table><tr><th>Year</th><th>Value @12%</th></tr><tr><td>0</td><td>₹10,000</td></tr><tr><td>7</td><td>₹22,107</td></tr><tr><td>15</td><td>₹54,736</td></tr><tr><td>30</td><td>₹2,99,599</td></tr></table>
 <div class="tip"><b>RULE OF 72 ›</b> Years to double ≈ 72 ÷ return%. At 12% → ~6 yrs. At 8% → 9 yrs. Memorize this.</div>
 <h4>Risk = volatility + permanent loss</h4>
 <ul><li><strong>Volatility</strong>: price swings (survivable if you don't sell)</li>
 <li><strong>Permanent loss</strong>: company dies, or you panic-sell the bottom (the real killer)</li>
 <li>Higher expected return <strong>always</strong> means higher risk. No exceptions. Anyone promising "guaranteed high returns" is running a scam.</li></ul>
 <h4>The risk ladder (low → high)</h4>
 <p class="mono" style="color:var(--cyan)">FD/PPF → Govt bonds → Index funds → Blue-chip stocks → Small-caps → Options/F&O</p>
 <div class="warn"><b>BEGINNER TRAP ›</b> Starting at the top of the ladder (F&O) because it promises fast money. SEBI's FY26 study found 87.7% of individual F&O traders lost money. You climb the ladder over <em>years</em>.</div></div>`,

  setup: `<div class="card"><h3>What You Need (India)</h3>
 <ul><li><strong>PAN card</strong> + <strong>Aadhaar</strong> (KYC)</li>
 <li>A <strong>bank account</strong> linked</li>
 <li>A <strong>Demat account</strong> (holds your shares electronically) + <strong>Trading account</strong> — brokers bundle these</li></ul>
 <h4>Picking a broker</h4>
 <table><tr><th>Type</th><th>Examples</th><th>Best for</th></tr>
 <tr><td>Discount</td><td>Zerodha, Groww, Upstox</td><td>Low fees, beginners</td></tr>
 <tr><td>Full-service</td><td>ICICI Direct, HDFC Sec</td><td>Hand-holding (pricier)</td></tr></table>
 <div class="tip"><b>DO ›</b> Start with a discount broker. Enable <strong>paper trading / virtual</strong> mode first. Most apps have it — practice with fake money for weeks.</div>
 <div class="warn"><b>DON'T ›</b> Enable F&O segment yet. Don't fund more than you'd be okay losing entirely.</div>
 <h4>Costs to know</h4>
 <ul><li><strong>Brokerage</strong>: ₹0–20 per trade (delivery often free)</li>
 <li><strong>STT, exchange fees, GST, stamp duty</strong>: small, automatic</li>
 <li>These add up if you trade often — a hidden reason frequent trading loses.</li></ul>
 <div class="tip"><b>SAFETY ›</b> Since Oct 2025, SEBI-registered intermediaries collect money only through "@valid" UPI handles (brokers use <span class="kbd">.brk</span>, mutual funds use <span class="kbd">.mf</span>). Use the SEBI Check tool to confirm a broker is registered before funding an account.</div></div>`,

  index: `<div class="card"><h3>The Beginner's Best Weapon</h3>
 <p>An <strong>index fund</strong> buys <em>every</em> stock in an index (e.g. Nifty 50) in proportion. You instantly own 50 of India's biggest companies. No stock-picking skill needed.</p>
 <h4>Why it beats most pros</h4>
 <ul><li><strong>Diversified</strong>: one company tanking barely dents you</li>
 <li><strong>Cheap</strong>: expense ratio ~0.1–0.2% vs 1–2% for active funds</li>
 <li><strong>Data</strong>: SPIVA reports show ~80%+ of active funds underperform their index over 10 yrs</li></ul>
 <table><tr><th></th><th>Index Fund</th><th>ETF</th></tr>
 <tr><td>How you buy</td><td>Via AMC, end-of-day NAV</td><td>Live on exchange, like a stock</td></tr>
 <tr><td>Needs demat?</td><td>No</td><td>Yes</td></tr>
 <tr><td>Best for SIP</td><td>✓ easier</td><td>Possible, clunkier</td></tr></table>
 <div class="eg"><b>EG ›</b> UTI/HDFC/ICICI Nifty 50 Index Fund — same underlying index, pick lowest expense ratio + tracking error.</div>
 <div class="tip"><b>FOUNDATION ›</b> For 90% of people, a low-cost Nifty 50 (or Nifty 500) index SIP is the entire core portfolio. Everything else is optional seasoning.</div></div>`,

  alloc: `<div class="card"><h3>Don't Put All Eggs in One Basket</h3>
 <p><strong>Asset allocation</strong> = how you split money across asset types. It explains ~90% of long-term returns — more than stock picking.</p>
 <h4>A simple beginner template</h4>
 <table><tr><th>Asset</th><th>%</th><th>Role</th></tr>
 <tr><td>Equity (index funds)</td><td>60–70</td><td>Growth</td></tr>
 <tr><td>Debt (bonds/PPF/FD)</td><td>20–30</td><td>Stability</td></tr>
 <tr><td>Gold</td><td>5–10</td><td>Crisis hedge</td></tr>
 <tr><td>Cash</td><td>buffer</td><td>Emergency (6mo expenses)</td></tr></table>
 <div class="tip"><b>RULE OF THUMB ›</b> Equity % ≈ 100 − your age. Age 25 → ~75% equity. Adjust for risk tolerance.</div>
 <h4>SIP = Systematic Investment Plan</h4>
 <ul><li>Auto-invest fixed ₹ every month</li>
 <li><strong>Rupee-cost averaging</strong>: buy more units when cheap, fewer when expensive</li>
 <li>Removes emotion + timing guesswork — the #1 beginner advantage</li></ul>
 <div class="warn"><b>REBALANCE ›</b> Once a year, sell what grew too big, buy what shrank, to restore your target %. Forces "buy low, sell high" mechanically.</div></div>`,

  fundamentals: `<div class="card"><h3>Is This Company Worth Owning?</h3>
 <p>If you ever buy <em>individual</em> stocks (later, optional), you judge the business — not the chart.</p>
 <h4>Key ratios</h4>
 <table><tr><th>Metric</th><th>Means</th><th>Rough read</th></tr>
 <tr><td>P/E</td><td>Price ÷ Earnings</td><td>How much you pay per ₹1 profit. High = pricey/growth</td></tr>
 <tr><td>ROE</td><td>Return on Equity</td><td>>15% = efficient</td></tr>
 <tr><td>Debt/Equity</td><td>Leverage</td><td>&lt;1 generally safer</td></tr>
 <tr><td>EPS growth</td><td>Profit/share trend</td><td>Rising = good</td></tr></table>
 <h4>3 statements (in plain words)</h4>
 <ul><li><strong>Income statement</strong>: did it make a profit?</li>
 <li><strong>Balance sheet</strong>: what does it own vs owe?</li>
 <li><strong>Cash flow</strong>: is real cash coming in? (hardest to fake)</li></ul>
 <div class="eg"><b>EG ›</b> Two firms, both ₹100 share. A: P/E 15, ROE 22%, low debt. B: P/E 60, ROE 8%, high debt. A is the calmer business; B is a bet on future hype.</div>
 <div class="warn"><b>CAUTION ›</b> Ratios are context-dependent. A "high" P/E for a bank ≠ high for a tech firm. Compare within sector. See the Research tab for a full checklist with thresholds.</div></div>`,

  tax: `<div class="card"><h3>Indian Capital Gains (verify current rules)</h3>
 <table><tr><th>Holding</th><th>Type</th><th>Tax (equity, FY26-27)</th></tr>
 <tr><td>&lt; 1 yr</td><td>STCG</td><td>20%</td></tr>
 <tr><td>&gt; 1 yr</td><td>LTCG</td><td>12.5% above ₹1.25L/yr exemption</td></tr></table>
 <ul><li><strong>Dividends</strong>: taxed at your slab rate</li>
 <li><strong>ELSS funds</strong>: equity funds w/ 80C deduction + 3yr lock-in</li>
 <li><strong>Debt mutual funds</strong> (&gt;65% in debt, bought on/after 1 Apr 2023): taxed at your slab rate regardless of holding period, no indexation</li>
 <li><strong>F&amp;O profits</strong>: treated as business income (different rules, audit thresholds); STT on F&O rose in Budget 2026 (futures 0.05%, options 0.15% of premium)</li></ul>
 <div class="warn"><b>VERIFY ›</b> The new Income Tax Act 2025 (in force from 1 Apr 2026) renumbered sections — the old 111A/112A references you'll see in older articles no longer match the Act. Rates above are unchanged by the renumbering. Tax rules change yearly in Budget. Always confirm current rates with a CA or the IT dept site before filing. This is a teaching reference, not tax advice.</div>
 <div class="tip"><b>TAKEAWAY ›</b> Long-term holding is taxed lighter <em>and</em> compounds better. The tax code itself rewards patience over churning.</div></div>`,

  mfSelect: `<div class="card"><h3>Picking Between Funds, Not Just "A Fund"</h3>
 <p>Once you've decided <em>how much</em> to invest (Module 5), the next skill is choosing <em>which</em> fund — within a category, funds can differ a lot.</p>
 <h4>Direct vs Regular — always Direct</h4>
 <div class="tip"><b>RULE ›</b> Always buy the <strong>Direct Plan</strong>, never Regular. Regular plans pay a distributor commission baked into a higher expense ratio — often 0.5–1.5%/yr more, compounding away for decades.</div>
 <h4>Expense ratio (TER)</h4>
 <table><tr><th>Fund type</th><th>Good TER (Direct)</th></tr>
 <tr><td>Index fund / ETF</td><td>Below 0.3%</td></tr>
 <tr><td>Active equity fund</td><td>Below 1%</td></tr></table>
 <p>Since Apr 2026, SEBI requires TER to be shown in three parts: a base expense ratio, brokerage, and statutory levies — compare the total, not just one line.</p>
 <h4>Don't chase point returns</h4>
 <ul><li><strong>Point return</strong> (e.g. "1-year return: 32%") depends entirely on the start/end date picked — easy to cherry-pick.</li>
 <li><strong>Rolling returns</strong> check every possible window (e.g. every 3-year period over 10 years) — look at how often the fund beat its benchmark, not just one number.</li>
 <li>For index funds: check <strong>tracking error</strong> (SEBI caps it at 2% for equity index funds) and <strong>tracking difference</strong> — lower is better, published monthly by the AMC and AMFI.</li></ul>
 <h4>Other checks before buying</h4>
 <ul><li><strong>AUM</strong>: fine to be large for index/large-cap funds; very large AUM can hurt small-cap fund agility</li>
 <li><strong>Fund manager tenure</strong>: over 3 years on this scheme — a manager change resets the track record</li>
 <li><strong>Portfolio overlap</strong>: if two funds you own overlap &gt;50% in holdings, you're not as diversified as you think (check on Advisorkhoj or Kuvera)</li>
 <li><strong>SEBI riskometer &amp; category</strong>: compare funds only within the same category (large-cap vs large-cap, not large-cap vs small-cap)</li>
 <li><strong>Exit load</strong>: usually 1% if redeemed within a year for equity funds; ELSS has a 3-year lock-in regardless</li></ul>
 <div class="warn"><b>CAUTION ›</b> A fund's past 1-year return is the least useful number to pick it on. It's mostly noise.</div></div>`,

  ipoEval: `<div class="card"><h3>Reading an IPO Before You Apply</h3>
 <p>Every IPO publishes a <strong>Red Herring Prospectus (RHP)</strong> on SEBI, NSE and BSE. Reading the key sections takes 20 minutes and tells you more than any "GMP" number.</p>
 <h4>What to check in the RHP</h4>
 <ul><li><strong>Objects of the issue</strong>: fresh issue (new money into the company) vs <strong>OFS</strong> (Offer for Sale — existing shareholders cashing out). If OFS is more than ~50% of the issue, early investors are exiting, not funding growth.</li>
 <li><strong>Use of proceeds</strong>: repaying debt or "general corporate purposes" (capped at 25%) is a weaker use than funding expansion.</li>
 <li><strong>Peer valuation</strong>: the "Basis for Offer Price" section compares the IPO's P/E with listed peers — is it priced at a premium or discount, and why?</li>
 <li><strong>Financial trend</strong>: 3-year revenue/profit trend, and watch for a profit spike right before the IPO.</li>
 <li><strong>Promoter background</strong>: past SEBI orders, other group companies, litigation.</li></ul>
 <h4>Allotment mechanics (mainboard)</h4>
 <table><tr><th>Category</th><th>Share of issue</th></tr>
 <tr><td>QIB (institutions)</td><td>50%</td></tr>
 <tr><td>NII (HNI)</td><td>15%</td></tr>
 <tr><td>Retail (up to ₹2L)</td><td>35%</td></tr></table>
 <p>When retail is oversubscribed, allotment is a lottery — one lot per winner. Applying for more lots doesn't improve your odds. Anchor investors get 40% of the QIB portion, with 50% of their shares locked for 30 days and the rest for 90 — expect possible selling pressure around those dates.</p>
 <div class="warn"><b>GMP ›</b> Grey Market Premium is unregulated, easy to manipulate, and a poor predictor. In 2025, 65% of mainboard IPOs listed above issue price but the median listing gain was only 3.8%, and by year-end 59% traded below their listing price.</div>
 <div class="warn"><b>SME IPOs ›</b> Since Mar 2025, SME IPOs need a minimum 2-lot application (shutting out small retail investors), an operating profit test, and OFS capped at 20% — but they still carry low liquidity and a history of price manipulation. Treat with extra caution.</div>
 <div class="tip"><b>PAYMENT ›</b> Always apply via ASBA/UPI — your money is blocked, not debited, until allotment. Never pay an "agent" directly for IPO shares.</div></div>`,

  review: `<div class="card"><h3>The Unglamorous Skill: Reviewing What You Own</h3>
 <h4>A yearly review routine</h4>
 <ul><li>Once a year (pick a fixed date), check your actual asset allocation against your target (Module 5).</li>
 <li><strong>Rebalance</strong> when any asset class drifts more than ~5 percentage points from target — sell a bit of what grew, buy what shrank.</li>
 <li>Harvest long-term equity gains up to the ₹1.25L/yr LTCG-exempt limit where it makes sense, rather than letting gains pile up in one year.</li>
 <li>Check for portfolio overlap if you've added funds over time (Module 17).</li></ul>
 <h4>Staying safe from fraud</h4>
 <ul><li><strong>Unregistered advice is illegal.</strong> SEBI has banned or fined several popular "trading guru" finfluencers — bans exceeding ₹50 crore in some cases. A registered adviser or research analyst must appear on SEBI's intermediary search.</li>
 <li>Since Oct 2025, registered brokers and AMCs collect payments only via "@valid" UPI handles (<span class="kbd">.brk</span>, <span class="kbd">.mf</span>, etc). Anything else is a red flag.</li>
 <li>Educational content using recent price data to "teach" setups must lag prices by at least 30 days if the creator isn't SEBI-registered — a channel giving live "buy/sell" calls without registration is breaking the rules, not just being generous.</li>
 <li>Use SEBI SCORES / the SMART ODR portal to file a complaint against any registered intermediary.</li></ul>
 <div class="warn"><b>RULE ›</b> No tip-based trades — ever. If you can't explain <em>why</em> in your own words using this course's checklists, don't buy it.</div>
 <div class="tip"><b>HABIT ›</b> Put a recurring calendar reminder for your annual review. This one habit does more for your returns than any stock pick.</div></div>`,

  live: `<div class="card"><h3>Going Live — Small & Boring</h3>
 <div class="warn"><b>GATE ›</b> Only reach here after Phases 1–2 + passing quizzes. Real money now.</div>
 <h4>First steps</h4>
 <ul><li>Build an <strong>emergency fund</strong> (6 months expenses) <em>before</em> investing</li>
 <li>Clear high-interest debt (credit cards 36%+) first — that's a guaranteed "return"</li>
 <li>Start <strong>one</strong> SIP into a low-cost Nifty 50 index fund — even ₹500/mo</li>
 <li>Automate it. Don't check daily. Set 1 review date/year.</li></ul>
 <div class="tip"><b>MINDSET ›</b> Your first goal is not profit — it's <strong>building the habit</strong> and surviving your first market drop without panic-selling. That emotional rep is worth more than the returns.</div>
 <h4>What success looks like (year 1)</h4>
 <ul><li>You invested consistently every month ✓</li>
 <li>You did NOT panic-sell during a dip ✓</li>
 <li>You understand what you own ✓</li>
 <li>Returns: irrelevant this year. Behavior is the win.</li></ul></div>`,

  candles: `<div class="card"><h3>Reading Price Action</h3>
 <p>A <strong>candlestick</strong> shows 4 prices for a period: Open, High, Low, Close (OHLC).</p>
 <ul><li><strong>Body</strong> = open↔close. Green/white = close above open (up). Red/black = down.</li>
 <li><strong>Wicks/shadows</strong> = the high & low extremes reached</li></ul>
 <h4>High-signal single candles</h4>
 <table><tr><th>Pattern</th><th>Looks like</th><th>Hints at</th></tr>
 <tr><td>Doji</td><td>Tiny body, long wicks</td><td>Indecision / possible reversal</td></tr>
 <tr><td>Hammer</td><td>Small body up top, long lower wick</td><td>Buyers fought back (bullish)</td></tr>
 <tr><td>Shooting star</td><td>Small body bottom, long upper wick</td><td>Sellers fought back (bearish)</td></tr>
 <tr><td>Marubozu</td><td>Big body, no wicks</td><td>Strong conviction one side</td></tr></table>
 <h4>2–3 candle combos</h4>
 <ul><li><strong>Engulfing</strong>: a big candle swallows the prior one → momentum shift</li>
 <li><strong>Morning/Evening star</strong>: 3-candle reversal at tops/bottoms</li></ul>
 <div class="warn"><b>REALITY ›</b> Candlesticks are probabilities, not prophecies. They work as <em>context</em> alongside trend, volume & S/R — never alone. Backtest before trusting any pattern.</div></div>`,

  sr: `<div class="card"><h3>Where Price Reacts</h3>
 <h4>Support & Resistance</h4>
 <ul><li><strong>Support</strong>: a price floor where buyers repeatedly step in</li>
 <li><strong>Resistance</strong>: a ceiling where sellers repeatedly appear</li>
 <li>Broken resistance often <strong>flips</strong> into new support (role reversal)</li></ul>
 <h4>Trend — the master variable</h4>
 <ul><li><strong>Uptrend</strong>: higher highs + higher lows</li>
 <li><strong>Downtrend</strong>: lower highs + lower lows</li>
 <li><strong>Range</strong>: sideways between S/R</li>
 <li class="mono" style="color:var(--cyan)">"The trend is your friend" — trade with it, not against it</li></ul>
 <h4>Volume = conviction</h4>
 <ul><li>A breakout on <strong>high volume</strong> = believable</li>
 <li>A move on <strong>low volume</strong> = suspect, often fakes out</li></ul>
 <div class="eg"><b>EG ›</b> Nifty bounces off 22,000 three times → strong support. A break below on heavy volume signals real selling, not noise.</div>
 <div class="tip"><b>DRAW ›</b> Practice marking S/R + trendlines on 20 charts in paper mode before any live trade.</div></div>`,

  indicators: `<div class="card"><h3>Math Layered on Price</h3>
 <p>Indicators summarize price/volume into a signal. They <strong>lag</strong> price — use as confirmation, not gospel.</p>
 <table><tr><th>Indicator</th><th>Type</th><th>Reads</th></tr>
 <tr><td>Moving Avg (MA/EMA)</td><td>Trend</td><td>Smoothed direction; 50 &amp; 200 MA crossovers</td></tr>
 <tr><td>RSI</td><td>Momentum</td><td>0–100; &gt;70 overbought, &lt;30 oversold</td></tr>
 <tr><td>MACD</td><td>Momentum/Trend</td><td>Crossovers signal shifts</td></tr>
 <tr><td>Bollinger Bands</td><td>Volatility</td><td>Price stretch from mean</td></tr></table>
 <div class="warn"><b>OVERFITTING TRAP ›</b> Piling on 8 indicators that all say the same thing isn't confirmation — it's noise. Pick 1 trend + 1 momentum tool, max.</div>
 <div class="eg"><b>EG ›</b> Price above 200-EMA (uptrend) + RSI pulls back to 40 then turns up = a classic "buy the dip in an uptrend" confluence.</div>
 <div class="tip"><b>GOLDEN/DEATH CROSS ›</b> 50-MA crossing above 200-MA = "golden cross" (bullish). Below = "death cross" (bearish). Famous, slow, sometimes late.</div></div>`,

  orders: `<div class="card"><h3>The Mechanics That Keep You Alive</h3>
 <h4>Order types</h4>
 <table><tr><th>Order</th><th>Does</th></tr>
 <tr><td>Market</td><td>Buy/sell now at best available price</td></tr>
 <tr><td>Limit</td><td>Only at your price or better</td></tr>
 <tr><td>Stop-loss (SL)</td><td>Auto-exit if price hits your pain line</td></tr>
 <tr><td>SL-Limit</td><td>SL that converts to a limit, not market</td></tr></table>
 <h4>Position sizing — the survival skill</h4>
 <div class="tip"><b>THE 1% RULE ›</b> Never risk more than 1–2% of total capital on a single trade. With ₹1,00,000, max loss per trade = ₹1,000–2,000. This alone outlasts 90% of beginners.</div>
 <h4>Sizing formula</h4>
 <div class="eg"><b>SIZE ›</b> Position size = (Capital × Risk%) ÷ (Entry − Stop)<br>
 Capital ₹1,00,000 · risk 1% = ₹1,000<br>
 Entry ₹500, Stop ₹480 → risk/share ₹20<br>
 Qty = 1,000 ÷ 20 = <b>50 shares</b></div>
 <div class="warn"><b>NON-NEGOTIABLE ›</b> Every trade needs a pre-decided stop-loss <em>before</em> you enter. No SL = gambling.</div></div>`,

  expectancy: `<div class="card"><h3>The Only Math That Makes Money</h3>
 <h4>Risk:Reward (R:R)</h4>
 <ul><li>Risk ₹1 to make ₹2 = <strong>1:2 R:R</strong></li>
 <li>With 1:2, you can be <em>wrong 60% of the time</em> and still profit</li></ul>
 <h4>Expectancy = your edge per trade</h4>
 <div class="eg"><b>FORMULA ›</b> E = (Win% × AvgWin) − (Loss% × AvgLoss)<br><br>
 Win 40%, avg win ₹200<br>Loss 60%, avg loss ₹100<br>
 E = (0.4×200) − (0.6×100)<br>
 E = 80 − 60 = <b class="up">+₹20 per trade</b> → profitable edge</div>
 <ul><li>Positive expectancy + enough trades = profit over time</li>
 <li>Negative expectancy + leverage = the F&O blowup story</li></ul>
 <div class="tip"><b>JOURNAL ›</b> Log every paper trade: entry, exit, R:R, reason, emotion. After 50 trades you'll <em>know</em> your real win rate &amp; expectancy — not guess it.</div>
 <div class="warn"><b>TRUTH ›</b> You don't need to be right often. You need wins bigger than losses + discipline to follow your rules. That's the whole game.</div></div>`,

  strats: `<div class="card"><h3>Beginner-Appropriate Styles</h3>
 <table><tr><th>Style</th><th>Hold time</th><th>Idea</th></tr>
 <tr><td>Swing</td><td>Days–weeks</td><td>Catch one leg of a trend</td></tr>
 <tr><td>Momentum</td><td>Days–months</td><td>Buy strength, ride it</td></tr>
 <tr><td>Mean-reversion</td><td>Short</td><td>Bet stretched price snaps back</td></tr>
 <tr><td>Breakout</td><td>Varies</td><td>Enter as price clears resistance</td></tr></table>
 <div class="warn"><b>AVOID (for now) ›</b> Intraday/scalping. Highest skill, highest cost, lowest beginner survival rate. Day-trading is where most of that 87.7% live.</div>
 <h4>Anatomy of any strategy</h4>
 <ul><li><strong>Entry rule</strong> (exact, written)</li>
 <li><strong>Stop-loss</strong> (where you're wrong)</li>
 <li><strong>Target</strong> (where you take profit, R:R ≥ 1:2)</li>
 <li><strong>Position size</strong> (1% rule)</li>
 <li><strong>Backtest</strong> on history, then forward-test on paper</li></ul>
 <div class="tip"><b>PROCESS ›</b> A strategy isn't a tip — it's a written, testable, repeatable rule set. If you can't write it down, you can't trade it.</div></div>`,

  options: `<div class="card"><h3>Derivatives — Handle With Extreme Care</h3>
 <div class="warn"><b>STOP ›</b> Do NOT trade options until you've survived 6+ months of <em>profitable</em> paper trading equities. This module is awareness, not a green light.</div>
 <h4>Calls & Puts</h4>
 <ul><li><strong>Call</strong>: right to buy at a set price (bullish bet)</li>
 <li><strong>Put</strong>: right to sell at a set price (bearish/hedge)</li>
 <li>You pay a <strong>premium</strong>. Buyers' max loss = premium. <em>Sellers'</em> loss can be huge.</li></ul>
 <h4>The Greeks (sensitivities)</h4>
 <table><tr><th>Greek</th><th>Measures</th></tr>
 <tr><td>Delta</td><td>Sensitivity to price move</td></tr>
 <tr><td>Theta</td><td>Time decay (eats option buyers daily)</td></tr>
 <tr><td>Vega</td><td>Sensitivity to volatility</td></tr>
 <tr><td>Gamma</td><td>Rate of Delta change</td></tr></table>
 <div class="warn"><b>WHY MOST LOSE F&O ›</b> Buying cheap weekly OTM options that decay to zero via Theta. It feels like a lottery ticket — and pays like one (usually nothing). SEBI's FY26 study found 92% of individual trader losses came from options.</div>
 <div class="tip"><b>LEGIT USE ›</b> Hedging (a put as portfolio insurance) is options' real value — not lottery speculation. You have the coding background; if you go quant later, options pricing (Black-Scholes) is a worthy deep dive.</div></div>`,

  psych: `<div class="card"><h3>Why ~88% of F&O Traders Lose — It's Not Strategy</h3>
 <p>Markets are an emotion-extraction machine. Your brain's biases are the leak.</p>
 <table><tr><th>Bias</th><th>How it bleeds you</th></tr>
 <tr><td>Loss aversion</td><td>Hold losers (hoping), cut winners early</td></tr>
 <tr><td>Overconfidence</td><td>Oversize after a few wins → one blowup</td></tr>
 <tr><td>FOMO</td><td>Chase tops, buy the hype peak</td></tr>
 <tr><td>Recency bias</td><td>Assume the last move continues forever</td></tr>
 <tr><td>Confirmation bias</td><td>Only see news that agrees with your bag</td></tr>
 <tr><td>Revenge trading</td><td>Bet bigger to "win it back" → spiral</td></tr></table>
 <div class="tip"><b>DEFENSES ›</b> Written rules · pre-set stop-loss · position sizing · a trade journal · fixed review times · walk away after 2 losses in a day.</div>
 <h4>The honest scoreboard</h4>
 <ul><li>Long-term <strong>index investing</strong>: high success, low effort — where your wealth will likely come from</li>
 <li><strong>Active trading</strong>: a hard skilled craft; treat as a hobby/skill, not income, until proven over years of data</li></ul>
 <div class="warn"><b>SEBI DATA (FY26) ›</b> 87.7% of individual F&O traders lost money; average loss per trader ~₹1.17 lakh; 90% of losers went on to lose again the next year. Protect capital first, grow second. The trader who survives long enough to compound wins. Survival &gt; brilliance.</div></div>`,
}

export const QUIZZES = {
  m1: [{ q: 'What does a stock represent?', o: ['A loan to a company', 'A slice of ownership in a company', 'A guaranteed return', 'A government bond'], a: 1 },
    { q: 'In an order book, the "spread" is:', o: ['Total volume traded', 'Gap between best bid and best ask', 'The broker fee', 'The daily price range'], a: 1 },
    { q: 'Which has the HIGHEST risk?', o: ['Bond', 'Index fund', 'F&O derivative', 'Mutual fund'], a: 2 }],
  m2: [{ q: 'Using Rule of 72, at 9% return money doubles in ~:', o: ['4 years', '8 years', '12 years', '20 years'], a: 1 },
    { q: 'The "real killer" risk for investors is:', o: ['Daily volatility', 'Permanent loss / panic-selling', 'Dividends', 'Low brokerage'], a: 1 },
    { q: 'A "guaranteed high return" offer is most likely:', o: ['A great deal', 'A scam', 'A bond', 'An index fund'], a: 1 }],
  m3: [{ q: 'What should a beginner enable FIRST?', o: ['F&O segment', 'Paper/virtual trading mode', 'Margin/leverage', 'Intraday'], a: 1 },
    { q: 'For low fees, beginners should pick a:', o: ['Full-service broker', 'Discount broker', 'Private banker', 'Hedge fund'], a: 1 }],
  m4: [{ q: 'An index fund lets you:', o: ['Pick winning stocks', 'Own an entire index cheaply', 'Guarantee profit', 'Avoid all risk'], a: 1 },
    { q: 'Over 10 years, most active funds:', o: ['Beat their index', 'Underperform their index', 'Match exactly', 'Avoid losses'], a: 1 },
    { q: 'Key difference: ETF vs index fund:', o: ['ETF trades live on exchange', 'ETF is risk-free', 'Index fund needs no money', 'No difference'], a: 0 }],
  m5: [{ q: 'Rough equity % rule of thumb at age 25:', o: ['25%', '50%', '~75%', '100%'], a: 2 },
    { q: "SIP's main psychological benefit:", o: ['Guarantees profit', 'Removes timing/emotion via auto-investing', 'Avoids tax', 'Beats the index'], a: 1 },
    { q: 'Annual rebalancing forces you to:', o: ['Buy high sell low', 'Buy low sell high mechanically', 'Trade daily', 'Pick stocks'], a: 1 }],
  m6: [{ q: 'A P/E ratio tells you:', o: ['Company debt', 'Price paid per ₹1 of profit', 'Dividend amount', 'Cash in bank'], a: 1 },
    { q: 'Which is hardest to fake?', o: ['Income statement', 'Cash flow statement', 'Press release', 'P/E ratio'], a: 1 },
    { q: 'ROE above ~15% suggests:', o: ['High debt', 'Efficient use of capital', 'Overpriced stock', 'Low growth'], a: 1 }],
  m7: [{ q: 'Equity held >1 year falls under:', o: ['STCG', 'LTCG (lower tax)', 'No tax ever', 'Business income'], a: 1 },
    { q: 'The tax code generally rewards:', o: ['Frequent churning', 'Long-term holding', 'F&O trading', 'Day trading'], a: 1 }],
  m17: [{ q: 'Between Direct and Regular plans of the same fund, you should pick:', o: ['Regular, for the advice', 'Direct, always', 'Whichever has a better name', 'It never matters'], a: 1 },
    { q: 'A fund\'s single best 1-year return figure tells you:', o: ['Everything you need', 'Very little — check rolling returns instead', 'Its exact future return', 'Its expense ratio'], a: 1 },
    { q: 'If two funds you hold have 70% portfolio overlap, you are:', o: ['Well diversified', 'Effectively holding the same stocks twice', 'Guaranteed lower risk', 'Eligible for a tax break'], a: 1 }],
  m18: [{ q: 'OFS in an IPO means:', o: ['Fresh money into the company', 'Existing shareholders selling their shares', 'A guaranteed listing gain', 'The retail quota'], a: 1 },
    { q: 'Grey Market Premium (GMP) is:', o: ['A SEBI-regulated official price', 'An unregulated, unreliable estimate', 'The same as the issue price', 'Guaranteed at listing'], a: 1 },
    { q: 'In the retail IPO category, applying for more lots:', o: ['Guarantees allotment', 'Does not improve lottery odds', 'Is required', 'Lowers your odds'], a: 1 }],
  m19: [{ q: 'You should rebalance your portfolio when an asset class drifts by roughly:', o: ['0.5 percentage points', '5 percentage points or more', '50 percentage points', 'Never'], a: 1 },
    { q: 'An unregistered "finfluencer" giving live buy/sell calls is:', o: ['Providing a free service', 'Breaking SEBI rules', 'Required to be followed', 'The same as a registered adviser'], a: 1 },
    { q: 'A payment request for a broker/fund that does NOT use an "@valid" UPI handle is:', o: ['Normal', 'A red flag worth checking', 'Always safe', 'Irrelevant'], a: 1 }],
  m8: [{ q: 'Before investing, you should first:', o: ['Max out F&O', 'Build emergency fund + clear high-interest debt', 'Buy small-caps', 'Take a loan'], a: 1 },
    { q: 'Year-1 success is mainly measured by:', o: ['Returns %', 'Building habit + not panic-selling', 'Beating Nifty', 'Number of trades'], a: 1 }],
  m9: [{ q: 'A candle body shows:', o: ['High and low', 'Open and close', 'Volume', 'Only the close'], a: 1 },
    { q: 'A hammer (long lower wick) hints at:', o: ['Sellers winning', 'Buyers fighting back (bullish)', 'No information', 'Guaranteed reversal'], a: 1 },
    { q: 'Candlestick patterns are best used:', o: ['Alone, always reliable', 'As context with trend/volume/S&R', 'To guarantee trades', 'Ignored'], a: 1 }],
  m10: [{ q: 'An uptrend is defined by:', o: ['Lower highs & lower lows', 'Higher highs & higher lows', 'Flat price', 'Random spikes'], a: 1 },
    { q: 'A breakout on HIGH volume is:', o: ['Suspect/fake', 'More believable', 'Irrelevant', 'Always a sell'], a: 1 },
    { q: 'Broken resistance often becomes:', o: ['New support', 'Permanent ceiling', 'A dividend', 'Nothing'], a: 0 }],
  m11: [{ q: 'RSI above 70 typically signals:', o: ['Oversold', 'Overbought', 'No trend', 'Buy signal'], a: 1 },
    { q: 'Indicators relative to price are:', o: ['Leading/predictive', 'Lagging/confirming', 'Always right', 'Random'], a: 1 },
    { q: 'A "golden cross" is:', o: ['50-MA crossing above 200-MA', 'Price doubling', 'RSI at 30', 'A candle pattern'], a: 0 }],
  m12: [{ q: 'The 1% rule means:', o: ['Win 1% of trades', 'Risk ≤1-2% of capital per trade', 'Make 1% daily', 'Use 1% leverage'], a: 1 },
    { q: 'Capital ₹1L, risk 1%, risk/share ₹25. Qty =', o: ['25', '40', '100', '250'], a: 1 },
    { q: 'A trade with no stop-loss is:', o: ['Smart', 'Gambling', 'Tax-free', 'Low risk'], a: 1 }],
  m13: [{ q: 'With 1:2 R:R you can be wrong this often and still profit:', o: ['Never', 'Up to ~60%', 'Only 10%', 'Always'], a: 1 },
    { q: 'Expectancy formula: E =', o: ['Win% × AvgWin only', '(Win%×AvgWin) − (Loss%×AvgLoss)', 'Capital × Risk%', 'Entry − Stop'], a: 1 },
    { q: 'A trade journal helps you:', o: ['Guess your edge', 'Know your real win-rate & expectancy', 'Avoid taxes', 'Predict prices'], a: 1 }],
  m14: [{ q: 'Which style has the LOWEST beginner survival rate?', o: ['Swing', 'Long-term investing', 'Intraday scalping', 'Momentum'], a: 2 },
    { q: 'A real strategy must be:', o: ['A hot tip', 'Written, testable, repeatable', 'Based on feeling', 'Secret'], a: 1 }],
  m15: [{ q: 'Theta (time decay) primarily hurts:', o: ['Option sellers', 'Option buyers of OTM weeklies', 'Index funds', 'Bondholders'], a: 1 },
    { q: "Options' legitimate core use is:", o: ['Lottery speculation', 'Hedging / insurance', 'Guaranteed income', 'Avoiding risk'], a: 1 },
    { q: 'You should trade options only after:', o: ['Reading one article', '6+ months profitable paper trading', 'Watching a YouTube guru', 'Funding ₹10L'], a: 1 }],
  m16: [{ q: 'Loss aversion makes traders:', o: ['Cut winners early, hold losers', 'Always win', 'Avoid markets', 'Trade less'], a: 0 },
    { q: 'Revenge trading is:', o: ['A solid strategy', 'Betting bigger to win losses back → spiral', 'Hedging', 'Rebalancing'], a: 1 },
    { q: 'The trader who wins long-term prioritizes:', o: ['Brilliance', 'Capital survival', 'Maximum leverage', 'Daily action'], a: 1 }],
}

export const GLOSSARY = [
  ['Ask', 'Lowest price a seller will accept.'], ['Bid', 'Highest price a buyer offers.'],
  ['Spread', 'Gap between bid and ask.'], ['Liquidity', 'How easily you can buy/sell without moving price.'],
  ['Volatility', 'Magnitude of price swings.'], ['Demat', 'Account holding your shares electronically.'],
  ['SIP', 'Systematic Investment Plan — auto monthly investing.'], ['NAV', 'Net Asset Value — per-unit price of a fund.'],
  ['Index', 'A basket tracking a market segment (Nifty 50, Sensex).'], ['ETF', 'Exchange-Traded Fund — index basket trading like a stock.'],
  ['Expense ratio', 'Annual % fee a fund charges (TER).'], ['P/E', 'Price ÷ Earnings per share.'],
  ['ROE', 'Return on Equity — profit ÷ shareholder capital.'], ['ROCE', 'Return on Capital Employed — profit ÷ total capital used, debt included.'],
  ['EPS', 'Earnings Per Share.'],
  ['Dividend', 'Cash a company pays shareholders from profits.'], ['Blue-chip', 'Large, stable, established company.'],
  ['Bull market', 'Sustained rising prices.'], ['Bear market', 'Sustained falling prices.'],
  ['LTCG', 'Long-Term Capital Gains tax.'], ['STCG', 'Short-Term Capital Gains tax.'],
  ['Stop-loss', 'Auto-exit order limiting a loss.'], ['Limit order', 'Executes only at your price or better.'],
  ['Market order', 'Executes immediately at best available price.'], ['Position sizing', 'How many units to buy given your risk.'],
  ['Risk:Reward', 'Ratio of risk taken to profit targeted.'], ['Expectancy', 'Average profit/loss per trade over many trades.'],
  ['Drawdown', 'Peak-to-trough drop in your account.'], ['Leverage', 'Borrowed money to amplify position (and risk).'],
  ['Margin', 'Collateral required for leveraged trades.'], ['Candlestick', 'Bar showing Open/High/Low/Close.'],
  ['Doji', 'Indecision candle, tiny body.'], ['Support', 'Price floor where buyers step in.'],
  ['Resistance', 'Price ceiling where sellers appear.'], ['Breakout', 'Price clearing S/R with momentum.'],
  ['Trend', 'Persistent direction of price.'], ['Moving Average', 'Smoothed average price over N periods.'],
  ['RSI', 'Relative Strength Index — momentum oscillator 0–100.'], ['MACD', 'Moving Avg Convergence Divergence — momentum tool.'],
  ['Bollinger Bands', 'Volatility bands around a moving average.'], ['Golden cross', '50-MA crossing above 200-MA (bullish).'],
  ['Call option', 'Right to buy at a set price.'], ['Put option', 'Right to sell at a set price.'],
  ['Premium', 'Price paid for an option.'], ['Theta', 'Option time-decay sensitivity.'],
  ['Delta', 'Option price sensitivity to underlying move.'], ['Hedge', 'A position that offsets risk of another.'],
  ['F&O', 'Futures & Options — derivatives (high risk).'], ['Diversification', 'Spreading risk across many assets.'],
  ['Asset allocation', 'Split of capital across asset classes.'], ['Rebalancing', 'Restoring target allocation periodically.'],
  ['Compounding', 'Earning returns on prior returns.'], ['Rule of 72', '72÷return% ≈ years to double.'],
  ['FOMO', 'Fear Of Missing Out — chases tops.'], ['Backtest', 'Testing a strategy on historical data.'],
  ['RHP', 'Red Herring Prospectus — the detailed IPO offer document.'],
  ['OFS', 'Offer for Sale — existing shareholders selling shares in an IPO, vs a fresh issue.'],
  ['Anchor investor', 'A large institution allotted IPO shares a day before the issue opens, with a lock-in.'],
  ['GMP', 'Grey Market Premium — unregulated, unreliable pre-listing price estimate.'],
  ['QIB', 'Qualified Institutional Buyer — the institutional IPO allotment category.'],
  ['Direct plan', 'A mutual fund plan bought without a distributor — lower expense ratio.'],
  ['Regular plan', 'A mutual fund plan bought through a distributor — higher expense ratio (commission).'],
  ['Rolling returns', 'Fund returns measured over every possible window in a period, not just one start/end date.'],
  ['Tracking error', "How much an index fund's day-to-day returns deviate from its index."],
  ['Tracking difference', "The gap between a fund's return and its index's return over time."],
  ['Portfolio overlap', 'How much two funds hold the same underlying stocks.'],
  ['Exit load', 'A fee charged for redeeming a fund investment early.'],
  ['Riskometer', "SEBI's mandatory risk-level label on every mutual fund scheme."],
]

export const TASKS = {
  m1: ['Open any free charting app (TradingView/Kite). Find Reliance, identify its current price, today\'s high & low.', 'Write in your own words: difference between a stock, a bond, and a mutual fund.'],
  m2: ['Use Rule of 72: how long to double money at 6%, 12%, 18%? Compute all three.', 'Calculate ₹5,000/mo compounded at 12% for 20 years (use any SIP calculator online).'],
  m3: ['Compare 2 discount brokers on brokerage + account opening fees. Note which has paper trading.', 'List the documents you\'d need for KYC.'],
  m4: ['Find 2 Nifty 50 index funds. Compare their expense ratio AND tracking error.', 'Explain to a friend (out loud) why an index fund beats most active funds long-term.'],
  m5: ['Build a sample allocation for your age using the "100 − age" rule.', 'Set up (don\'t fund) a SIP mandate in a paper/demo to see the flow.'],
  m6: ['Pick any company. Find its P/E, ROE, and Debt/Equity. Decide: calm business or hype bet?', 'Compare the same metric across 2 companies in the SAME sector.'],
  m7: ['Look up the CURRENT LTCG & STCG equity rates (verify — they changed recently).', 'Identify one ELSS fund and note its lock-in + 80C benefit.'],
  m17: ['Pick 2 direct-plan funds in the same category. Compare TER, 3-year rolling return consistency, and fund manager tenure.', 'Check the portfolio overlap between two funds you already hold (or would consider) using a free overlap tool.'],
  m18: ['Find one open or recent IPO. Read its "Objects of the Issue" — is it fresh issue or OFS, and what %?', 'Look up the same IPO\'s retail subscription multiple and estimate your lottery odds if you\'d applied for 1 lot.'],
  m19: ['Write your own yearly portfolio review checklist (3-5 items).', 'Look up one finfluencer or channel you follow and check whether they appear in SEBI\'s registered intermediary search.'],
  m8: ['Confirm you have (or plan): 6-month emergency fund + no high-interest debt.', 'Write your year-1 goal in behavior terms, not return terms.'],
  m9: ['Mark 5 candlestick patterns on a real chart in paper mode (doji, hammer, engulfing…).', 'Find one case where a pattern "failed" — note why context mattered.'],
  m10: ['On 3 charts, draw support, resistance, and the current trend.', 'Find a breakout — was volume high or low? Did it hold?'],
  m11: ['Add a 200-EMA + RSI to a chart. Find one "dip in uptrend" setup.', 'Find a recent golden or death cross on the Nifty chart.'],
  m12: ['Compute position size: ₹50,000 capital, 1% risk, entry ₹300, stop ₹285.', 'Place 3 paper trades — each WITH a pre-set stop-loss.'],
  m13: ['Track 10 paper trades. Compute your win% and expectancy.', 'Design one setup with a minimum 1:2 risk:reward.'],
  m14: ['Write ONE complete strategy: entry, stop, target, size, on paper.', 'Backtest it on 10 past chart instances. Did it have positive expectancy?'],
  m15: ['Look up one Nifty option chain. Identify a call, a put, and their premiums.', 'Read how Theta decayed a weekly OTM option over 3 days (observe, don\'t trade).'],
  m16: ['Review your trade journal — which bias cost you the most on paper?', 'Write your personal 5 trading rules. Stick them where you trade.'],
}
