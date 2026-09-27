import './RatingDisplay.css';

export function RatingDisplay({ rating, reviewCount, size = 'md' }) {
  return (
    <span className={`rating-display rating-${size}`}>
      <span className="rating-stars">★ {Number(rating ?? 4.8).toFixed(1)}</span>
      {reviewCount > 0 && <span className="rating-count">({reviewCount} reviews)</span>}
    </span>
  );
}
