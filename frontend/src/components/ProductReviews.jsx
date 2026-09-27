import { useEffect, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { reviewService } from '../services/reviewService';
import { orderService } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Pagination } from './Pagination';
import { usePagination } from '../hooks/usePagination';
import './ProductReviews.css';

const PAGE_SIZE = 5;

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
  // undefined = still checking, null = not eligible (never delivered), object = user's existing review
  const [eligible, setEligible] = useState(false);
  const [myReview, setMyReview] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const { page, setPage, totalPages, pageItems, total, rangeStart, rangeEnd } = usePagination(reviews, PAGE_SIZE);

  function loadReviews() {
    reviewService
      .list(productId)
      .then((data) => setReviews(data.reviews))
      .catch(() => setReviews([]));
  }

  useEffect(() => {
    loadReviews();

    if (isAuthenticated) {
      orderService
        .list()
        .then((data) => {
          const delivered = data.orders.some(
            (o) => o.status === 'Delivered' && (o.items || []).some((i) => i.productId === productId)
          );
          setEligible(delivered);
        })
        .catch(() => setEligible(false));

      reviewService
        .mine(productId)
        .then((data) => setMyReview(data.review))
        .catch(() => setMyReview(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, isAuthenticated]);

  function startEdit() {
    setForm({ rating: myReview.rating, title: myReview.title || '', comment: myReview.comment });
    setEditing(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.rating === 0) {
      showToast('Select a star rating.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      if (myReview) {
        const data = await reviewService.update(productId, form);
        setMyReview(data.review);
        showToast('Your review has been updated.', 'success');
      } else {
        const data = await reviewService.create(productId, form);
        setMyReview(data.review);
        showToast('Thanks for your review!', 'success');
      }
      setEditing(false);
      loadReviews();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const showForm = isAuthenticated && eligible && myReview !== undefined && (editing || !myReview);

  return (
    <div className="product-reviews">
      {reviews === null && <p className="text-body-sm">Loading reviews…</p>}

      {reviews && reviews.length === 0 && (
        <p className="text-body-sm product-reviews-empty">No reviews yet — be the first to share your experience.</p>
      )}

      {reviews && reviews.length > 0 && (
        <>
          <div className="product-reviews-list">
            {pageItems.map((r) => (
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
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={total}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="reviews"
          />
        </>
      )}

      {showForm && (
        <form className="product-review-form" onSubmit={handleSubmit}>
          <h4>{myReview ? 'Edit your review' : 'Write a review'}</h4>
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
          <div className="product-review-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="btn-spinner" /> : myReview ? 'Save Changes' : 'Submit Review'}
            </button>
            {myReview && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={submitting}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {isAuthenticated && eligible && myReview && !editing && (
        <div className="product-review-mine">
          <p className="text-body-sm">You've already reviewed this product.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={startEdit}>
            Edit Review
          </button>
        </div>
      )}
    </div>
  );
}
