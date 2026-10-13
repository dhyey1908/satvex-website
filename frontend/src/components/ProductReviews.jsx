import { useEffect, useRef, useState } from 'react';
import { Star, Loader2, X, PenLine } from 'lucide-react';
import { reviewService } from '../services/reviewService';
import { orderService } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { useToast } from '../context/ToastContext';
import { Pagination } from './Pagination';
import { usePagination } from '../hooks/usePagination';
import { ReviewImageUploader } from './ReviewImageUploader';
import { formatDate } from '../utils/date';
import './ProductReviews.css';

const MAX_REVIEW_IMAGES = 3;

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

export function ProductReviews({ productId, rating, reviewCount }) {
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGate();
  const { showToast } = useToast();
  const [reviews, setReviews] = useState(null);
  // undefined = still checking, null = not eligible (never delivered), object = user's existing review
  const [eligible, setEligible] = useState(false);
  const [myReview, setMyReview] = useState(undefined);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', comment: '', images: [] });
  const [submitting, setSubmitting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  // Set by the "Write a Review" button so the form can be scrolled into
  // view once it's actually in the DOM (it may need setEditing(true) first,
  // which only takes effect on the next render) rather than racing it.
  const [scrollToFormPending, setScrollToFormPending] = useState(false);
  const formRef = useRef(null);
  const { page, setPage, totalPages, pageItems, total, rangeStart, rangeEnd } = usePagination(reviews, PAGE_SIZE);

  // Star-distribution bars in the summary card are built from the actual
  // loaded reviews (what's really being shown), not just the aggregate
  // rating/reviewCount passed down from the product.
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews ? reviews.filter((r) => r.rating === stars).length : 0,
  }));
  const distributionTotal = reviews?.length ?? 0;

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

  // Runs once the form (editing or fresh) has actually mounted after a
  // "Write a Review" click requested it — see handleWriteReviewClick.
  useEffect(() => {
    if (!scrollToFormPending) return;
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToFormPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToFormPending, editing, myReview]);

  function startEdit() {
    setForm({ rating: myReview.rating, title: myReview.title || '', comment: myReview.comment, images: myReview.images || [] });
    setEditing(true);
  }

  function handleWriteReviewClick() {
    if (!isAuthenticated) {
      // Resuming through handleWriteReviewClick itself would re-check
      // isAuthenticated against this render's (permanently stale) closure
      // — see performQuickAdd in ProductCard.jsx for the same pattern.
      requireAuth(() => performWriteReviewClick());
      return;
    }
    performWriteReviewClick();
  }

  function performWriteReviewClick() {
    if (!eligible) {
      showToast('You can write a review once your delivered order for this product arrives.', 'info');
      return;
    }
    if (myReview && !editing) startEdit();
    setScrollToFormPending(true);
  }

  function addImage(url) {
    setForm((p) => ({ ...p, images: [...p.images, url] }));
  }

  function removeImage(index) {
    setForm((p) => ({ ...p, images: p.images.filter((_, i) => i !== index) }));
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
      <div className="product-reviews-summary">
        <div className="product-reviews-summary-score">
          <span className="product-reviews-summary-number">{reviewCount ? Number(rating).toFixed(1) : '—'}</span>
          <span className="product-reviews-summary-stars">
            {'★'.repeat(Math.round(rating || 0))}
            {'☆'.repeat(5 - Math.round(rating || 0))}
          </span>
          <span className="product-reviews-summary-count">
            {reviewCount || 0} review{reviewCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="product-reviews-summary-bars">
          {distribution.map(({ stars, count }) => {
            const pct = distributionTotal > 0 ? Math.round((count / distributionTotal) * 100) : 0;
            return (
              <div className="product-reviews-bar-row" key={stars}>
                <span className="product-reviews-bar-label">{stars}★</span>
                <span className="product-reviews-bar-track">
                  <span className="product-reviews-bar-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="product-reviews-bar-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary product-reviews-write-btn" onClick={handleWriteReviewClick}>
          <PenLine size={15} /> {myReview ? 'Edit Review' : 'Write a Review'}
        </button>
      </div>

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
                  <span className="product-review-date">{formatDate(r.createdAt)}</span>
                </div>
                {r.title && <p className="product-review-title">{r.title}</p>}
                <p className="product-review-comment">{r.comment}</p>
                {r.images && r.images.length > 0 && (
                  <div className="product-review-images">
                    {r.images.map((src, i) => (
                      <button
                        key={src + i}
                        type="button"
                        className="product-review-image-thumb"
                        onClick={() => setLightboxImage(src)}
                        aria-label="View full-size review photo"
                      >
                        <img src={src} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
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
        <form className="product-review-form" ref={formRef} onSubmit={handleSubmit}>
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
          <div className="field">
            <label>Photos (optional, up to {MAX_REVIEW_IMAGES})</label>
            {form.images.length > 0 && (
              <div className="product-review-form-images">
                {form.images.map((url, i) => (
                  <div key={url + i} className="product-review-form-image">
                    <img src={url} alt="" />
                    <button
                      type="button"
                      className="product-review-form-image-remove"
                      onClick={() => removeImage(i)}
                      disabled={submitting}
                      aria-label="Remove photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.images.length < MAX_REVIEW_IMAGES && (
              <ReviewImageUploader onUploaded={addImage} disabled={submitting} />
            )}
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

      {lightboxImage && (
        <div className="product-review-lightbox" onClick={() => setLightboxImage(null)}>
          <button type="button" className="product-review-lightbox-close" aria-label="Close">
            <X size={22} />
          </button>
          <img src={lightboxImage} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

    </div>
  );
}
