import './RatingDisplay.css';

// With `onClick` the whole line is one button (the product page uses it to jump down to the reviews).
export function RatingDisplay({ rating, reviewCount, size = 'md', onClick }) {
  const content = reviewCount ? (
    <>
      <span className="rating-stars">★ {Number(rating).toFixed(1)}</span>
      <span className="rating-count">({reviewCount} review{reviewCount === 1 ? '' : 's'})</span>
    </>
  ) : (
    <span className="rating-count">New — no reviews yet</span>
  );
  const className = `rating-display rating-${size} ${reviewCount ? '' : 'rating-new'}`;
  if (onClick) {
    return (
      <button type="button" className={`${className} rating-link`} onClick={onClick} aria-label={reviewCount ? `${Number(rating).toFixed(1)} stars, ${reviewCount} reviews - read the reviews` : 'No reviews yet - go to the reviews'}>
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}
