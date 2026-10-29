import './PriceDisplay.css';

const inr = (n) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Price + crossed-out MRP. `offer` is the backend-computed display block on a
 * selling option (`option.offer`: saveAmount, perPiece, ...) — the savings and
 * per-piece figures are shown exactly as received, never calculated here.
 * Pass `showPerPiece` for multi-piece packs to add the "₹Y / piece" line.
 */
export function PriceDisplay({ price, compareAtPrice, size = 'md', offer, showPerPiece = false }) {
  const onSale = compareAtPrice && compareAtPrice > price;

  return (
    <span className={`price-display price-${size}`}>
      <span className="price-current">₹{price}</span>
      {onSale && <span className="price-compare">₹{compareAtPrice}</span>}
      {offer?.saveAmount > 0 && <span className="price-discount-badge">Save {inr(offer.saveAmount)}</span>}
      {showPerPiece && offer?.perPiece > 0 && <span className="price-per-piece">{inr(offer.perPiece)} / piece</span>}
    </span>
  );
}
