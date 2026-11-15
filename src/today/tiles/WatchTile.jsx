import Tile from '../../ui/Tile.jsx';
import Chip from '../../ui/Chip.jsx';
import './tiles-b.css';

const price = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Watch tile (mint). Props only. Shows the FIRST stock of the watchlist (the
// host picks it); index symbols such as NIFTY are rejected by /api/quote.
//   item:  { symbol, name?, priceAtAdd? } or null when the watchlist has no stock
//   quote: { price, changePct } from /api/quote, or null/undefined when offline,
//          not loaded or errored. Then the tile falls back to item.priceAtAdd.
//   loading, href (default Invest watch)
// No sparkline: /api/quote is range=1d and returns no series.
export default function WatchTile({ loading = false, item = null, quote = null, href = '#/invest/watch' }) {
  if (loading) {
    return (
      <Tile tone="mint" title="Watch" href={href} className="today-tile today-tile-watch">
        <p className="tb-note" aria-busy="true">Loading…</p>
      </Tile>
    );
  }
  if (!item) {
    return (
      <Tile tone="mint" title="Watch" href={href} className="today-tile today-tile-watch">
        <p className="tb-note">Add a stock to your watchlist.</p>
      </Tile>
    );
  }

  const live = quote && !quote.error && Number.isFinite(quote.price) ? quote : null;
  const symbol = item.symbol || item.name || '';
  const shown = live ? live.price : item.priceAtAdd;
  const hasPrice = Number.isFinite(shown);
  const change = live && Number.isFinite(live.changePct) ? live.changePct : null;
  const up = change != null && change >= 0;

  return (
    <Tile tone="mint" title="Watch" meta={symbol} href={href} className="today-tile today-tile-watch">
      <div className="tb-big" data-testid="watch-price">{hasPrice ? price(shown) : '—'}</div>
      {live ? (
        change != null && (
          <Chip tone={up ? 'success' : 'hot'}>
            <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}{change.toFixed(2)}%
          </Chip>
        )
      ) : (
        <p className="tb-note" data-testid="watch-offline">
          {hasPrice ? 'Offline. Price when added.' : 'Offline. No saved price.'}
        </p>
      )}
    </Tile>
  );
}
