import './PriceDisplay.css';

export function PriceDisplay({ price, compareAtPrice, size = 'md' }) {
  const onSale = compareAtPrice && compareAtPrice > price;
  return (
    <span className={`price-display price-${size}`}>
      <span className="price-current">₹{price}</span>
      {onSale && <span className="price-compare">₹{compareAtPrice}</span>}
    </span>
  );
}
