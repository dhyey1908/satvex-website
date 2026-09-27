import { useEffect, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { reviewService } from '../services/reviewService';
import { orderService } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import './ProductReviews.css';

function StarInput({ value, onChange }) {
  return (
    <div className="review-star-input">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'active' : ''}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
        >
          <Star size={22} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [reviews, setReviews] = useState(null);
  const [eligible, setEligible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', comment: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    reviewService
      .list(productId)
      .then((data) => setReviews(data.reviews))
      .catch(() => setReviews([]));

    if (isAuthenticated) {
      orderService
        .list()
        .then((data) => {
          const purchased = data.orders.some((o) => (o.items || []).some((i) => i.productId === productId));
          setEligible(purchased);
        })
        .catch(() => setEligible(false));
    }
  }, [productId, isAuthenticated]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.rating === 0) {
      showToast('Select a star rating.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await reviewService.create(productId, form);
      showToast('Thanks! Your review is awaiting approval.', 'success');
      setSubmitted(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="product-reviews">
      {reviews === null && <p className="text-body-sm">Loading reviews…</p>}

      {reviews && reviews.length === 0 && (
        <p className="text-body-sm product-reviews-empty">No reviews yet — be the first to share your experience.</p>
      )}

      {reviews && reviews.length > 0 && (
        <div className="product-reviews-list">
          {reviews.map((r) => (
            <div key={r.reviewId} className="product-review-item">
              <div className="product-review-item-top">
                <span className="product-review-stars">
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </span>
                <span className="product-review-author">{r.userName}</span>
                <span className="product-review-date">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.title && <p className="product-review-title">{r.title}</p>}
              <p className="product-review-comment">{r.comment}</p>
            </div>
          ))}
        </div>
      )}

      {isAuthenticated && eligible && !submitted && (
        <form className="product-review-form" onSubmit={handleSubmit}>
          <h4>Write a review</h4>
          <StarInput value={form.rating} onChange={(rating) => setForm((p) => ({ ...p, rating }))} />
          <div className="field">
            <label htmlFor="review-title">Title (optional)</label>
            <input
              id="review-title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              maxLength={100}
            />
          </div>
          <div className="field">
            <label htmlFor="review-comment">Your review</label>
            <textarea
              id="review-comment"
              required
              minLength={10}
              rows={4}
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Submit Review'}
          </button>
        </form>
      )}

      {isAuthenticated && eligible && submitted && (
        <p className="product-reviews-empty">Your review has been submitted and is awaiting approval — thank you!</p>
      )}
    </div>
  );
}
