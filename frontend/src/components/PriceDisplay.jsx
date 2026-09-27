import './PriceDisplay.css';

export function PriceDisplay({ price, compareAtPrice, size = 'md' }) {
  const onSale = compareAtPrice && compareAtPrice > price;
  const discountPct = onSale ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100) : 0;

  return (
    <span className={`price-display price-${size}`}>
      {onSale && discountPct > 0 && <span className="price-discount-badge">{discountPct}% OFF</span>}
      <span className="price-current">₹{price}</span>
      {onSale && <span className="price-compare">₹{compareAtPrice}</span>}
    </span>
  );
}
