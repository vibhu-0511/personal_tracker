// Educational screening checklists — HOW to evaluate stocks/funds/IPOs.
// No buy/sell picks. Every item has a rule of thumb, why it matters, and where to check it.

export const STOCK_CHECKLIST = [
  { group: 'Profitability', items: [
    { metric: 'ROE / ROCE', rule: 'Above 15%, held for 5+ years (not meaningful for banks — use ROA/NIM instead)', why: 'Shows the business earns well on the capital put into it.', where: 'Screener.in, Tickertape' },
    { metric: 'Debt/Equity', rule: 'Below 0.5 (below 1 for capital-heavy sectors)', why: 'Borrowing magnifies losses in a downturn.', where: 'Screener.in, Moneycontrol' },
    { metric: 'Interest coverage', rule: 'Above 3x', why: 'Shows the company can comfortably pay interest on its debt.', where: 'Screener.in' },
    { metric: 'Free cash flow', rule: 'Positive in most of the last 5 years; CFO/PAT above 0.8', why: 'Profit without cash behind it is a common way to fake growth.', where: 'Screener.in cash-flow tab' },
  ] },
  { group: 'Growth & Valuation', items: [
    { metric: 'Earnings consistency', rule: '5-10yr sales/profit CAGR with few loss years', why: 'Steady growth is easier to trust than one good year.', where: 'Screener.in 10-year view' },
    { metric: 'P/E vs sector & own history', rule: 'Compare against sector median and the stock\'s own 5-10yr median; PEG around 1 or lower', why: 'A good business bought too expensive can still be a bad investment.', where: 'Tickertape, Trendlyne, Screener.in peers' },
  ] },
  { group: 'Ownership & Governance', items: [
    { metric: 'Promoter holding', rule: 'Stable or rising; many investors want above 40-50%', why: "Shows the founders' own money is still in the business.", where: 'NSE/BSE shareholding pattern, Screener.in' },
    { metric: 'Promoter pledging', rule: 'Ideally 0%; above 10% needs a look, above 25-50% is a red flag', why: 'A falling price can force lenders to sell pledged shares, pushing price down further.', where: 'Trendlyne, Moneycontrol, NSE pledged data' },
    { metric: 'Working capital', rule: 'Debtor/inventory days stable or falling', why: 'Rising receivables can mean sales booked but not yet paid for.', where: 'Screener.in ratios tab' },
  ] },
  { group: 'Red flags', items: [
    { metric: 'Auditor resignation mid-term', rule: 'Investigate the resignation letter', why: 'Often signals accounting disagreements.', where: 'BSE/NSE announcements' },
    { metric: 'Related-party transactions', rule: 'Large or growing relative to revenue', why: 'Can move value out of the company to promoter-linked entities.', where: 'Annual report notes' },
    { metric: 'ASM/GSM surveillance lists', rule: 'Check before buying', why: 'Exchange flags for unusual price/volume activity.', where: 'NSE/BSE surveillance pages' },
  ] },
]

export const MF_CHECKLIST = [
  { metric: 'Plan type', rule: 'Always Direct, never Regular', why: 'Regular plans pay distributor commission — often 0.5-1.5%/yr more, compounding away for decades.', where: 'AMC website, Kuvera, Coin' },
  { metric: 'Expense ratio (TER)', rule: 'Index funds below 0.3%; active equity below 1%', why: 'Fees compound against you every year, in every market.', where: 'AMFI, Value Research' },
  { metric: 'Rolling returns', rule: 'Check 3yr/5yr rolling windows, not point returns', why: 'Point returns depend entirely on the start/end date picked.', where: 'Value Research, Morningstar India' },
  { metric: 'Tracking error (index funds)', rule: 'Lower is better; SEBI caps equity index funds at 2%', why: "Measures how closely the fund actually follows its index.", where: 'AMC factsheet, AMFI' },
  { metric: 'AUM', rule: 'Large is fine for index/large-cap; very large AUM can hurt small-cap agility', why: 'Fund size affects how nimbly a manager can trade.', where: 'AMC factsheet' },
  { metric: 'Fund manager tenure', rule: 'Above 3 years on this scheme', why: 'A manager change resets the track record.', where: 'AMC factsheet' },
  { metric: 'Portfolio overlap', rule: 'Above ~50% overlap between two funds means duplicated bets', why: "You may be less diversified than you think.", where: 'Advisorkhoj, Dezerv, Kuvera' },
  { metric: 'Category & riskometer', rule: 'Compare only within the same SEBI category', why: 'A large-cap fund and a small-cap fund are not comparable.', where: 'AMFI, factsheet' },
  { metric: 'Exit load', rule: 'Usually 1% within 1yr for equity; ELSS has a 3yr lock-in', why: 'Matters if you might need the money early.', where: 'Scheme document' },
]

export const IPO_CHECKLIST = [
  { metric: 'Fresh issue vs OFS', rule: 'If OFS is above ~50% of the issue, early investors are mostly cashing out', why: 'Fresh issue money funds the company; OFS money goes to existing holders.', where: 'RHP — "Objects of the Issue"' },
  { metric: 'Use of proceeds', rule: 'Watch for debt repayment or vague "general corporate purposes" (capped at 25%)', why: 'Weaker uses than funding real expansion.', where: 'RHP' },
  { metric: 'Peer valuation', rule: "Compare the IPO's P/E against listed peers", why: 'Shows if the price is at a premium or discount, and why.', where: 'RHP — "Basis for Offer Price"' },
  { metric: 'Financial trend', rule: '3yr revenue/profit trend; be wary of a profit spike right before the IPO', why: 'Numbers can be dressed up for the listing.', where: 'RHP financial statements' },
  { metric: 'Promoter background', rule: 'Check past SEBI orders, other group companies, litigation', why: 'Track record matters as much for IPOs as for existing companies.', where: 'RHP — "Risk Factors"' },
  { metric: 'Anchor investors & lock-in', rule: 'Anchor shares: 50% locked 30 days, 50% locked 90 days', why: 'Selling pressure often appears around those unlock dates.', where: 'RHP, exchange circulars' },
  { metric: 'Subscription by category', rule: 'Retail lottery odds do NOT improve by applying for more lots', why: 'Understand the mechanics before applying.', where: 'NSE/BSE subscription data' },
  { metric: 'Grey Market Premium (GMP)', rule: 'Treat as noise — unregulated and unreliable', why: '2025: median listing gain was only 3.8% despite high GMP hype.', where: 'N/A — deliberately not a data source here' },
  { metric: 'SME IPOs', rule: 'Extra caution: lower liquidity, thinner disclosure, min. 2-lot application since Mar 2025', why: 'Higher manipulation and liquidity risk than mainboard IPOs.', where: 'RHP, SME platform pages' },
]

export const OSS_TOOLS = [
  { name: 'TradingView Lightweight Charts', use: 'Candlestick/line charts for the watchlist', url: 'https://github.com/tradingview/lightweight-charts' },
  { name: 'mfapi.in', use: 'Free mutual fund NAV search & history API (used by this watchlist)', url: 'https://www.mfapi.in' },
  { name: 'casparser', use: 'Parses your CAMS/KFintech CAS statement PDF into real transactions', url: 'https://github.com/codereverser/casparser' },
  { name: 'trading-signals', use: 'Maintained TypeScript technical indicators (RSI, EMA, MACD)', url: 'https://github.com/bennycode/trading-signals' },
  { name: 'PKScreener', use: 'Catalogue of NSE screening/scanning criteria to learn from', url: 'https://github.com/pkjmesra/PKScreener' },
  { name: 'backtesting.py', use: 'The easiest way to learn strategy backtesting (run locally, not in this app)', url: 'https://github.com/kernc/backtesting.py' },
  { name: 'OpenBB', use: 'Broad research platform for fundamentals & macro data', url: 'https://github.com/OpenBB-finance/OpenBB' },
  { name: 'OpenAlgo', use: 'Self-hosted sandbox for paper trading against live Indian market data', url: 'https://github.com/marketcalls/openalgo' },
]

export const LINKS = [
  { name: 'Screener.in', url: 'https://www.screener.in', note: 'Stock fundamentals & custom screens' },
  { name: 'Tickertape', url: 'https://www.tickertape.in', note: 'Stock scorecards & peer comparison' },
  { name: 'Trendlyne', url: 'https://trendlyne.com', note: 'Pledge data, IPO dashboards' },
  { name: 'Value Research', url: 'https://www.valueresearchonline.com', note: 'Mutual fund ratings & rolling returns' },
  { name: 'AMFI', url: 'https://www.amfiindia.com', note: 'Official NAV & fund data' },
  { name: 'NSE India', url: 'https://www.nseindia.com', note: 'Filings, shareholding, surveillance' },
  { name: 'BSE India', url: 'https://www.bseindia.com', note: 'Filings & announcements' },
]
