import './RatingDisplay.css';

export function RatingDisplay({ rating, reviewCount, size = 'md' }) {
  if (!reviewCount) {
    return (
      <span className={`rating-display rating-${size} rating-new`}>
        <span className="rating-count">New — no reviews yet</span>
      </span>
    );
  }
  return (
    <span className={`rating-display rating-${size}`}>
      <span className="rating-stars">★ {Number(rating).toFixed(1)}</span>
      <span className="rating-count">({reviewCount} review{reviewCount === 1 ? '' : 's'})</span>
    </span>
  );
}
