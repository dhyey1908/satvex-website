import { useEffect, useRef, useState } from 'react';
import { Star, Loader2, X, PenLine, BadgeCheck } from 'lucide-react';
import { reviewService } from '../services/reviewService';
import { orderService } from '../services/orderService';
import { useAuth } from '../context/AuthContext';
import { useAuthGate } from '../context/AuthGateContext';
import { useToast } from '../context/ToastContext';
import { ReviewImageUploader } from './ReviewImageUploader';
import { formatDate } from '../utils/date';
import './ProductReviews.css';

const MAX_REVIEW_IMAGES = 3;

// Reviews are fetched (sorted/filtered/counted by the backend) this many at a
// time; "Load more reviews" appends the next batch.
const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'highest', label: 'Highest rating' },
  { value: 'lowest', label: 'Lowest rating' },
];

const EMPTY_SUMMARY = { count: 0, average: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, verifiedCount: 0 };

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

export function ProductReviews({ productId, onSummary }) {
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGate();
  const { showToast } = useToast();
  // null = first load in flight. Everything below is exactly what the
  // backend returned for the current sort/filter (GET /products/:id/reviews).
  const [reviews, setReviews] = useState(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState('recent');
  const [starFilter, setStarFilter] = useState(0); // 0 = all
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
  const requestSeq = useRef(0);

  // offset 0 replaces the list; a later offset appends the next batch. The
  // sequence guard drops a slow response that was overtaken by a newer sort or
  // filter change.
  function loadReviews({ offset = 0, nextSort = sort, nextStar = starFilter } = {}) {
    const seq = ++requestSeq.current;
    if (offset > 0) setLoadingMore(true);
    reviewService
      .list(productId, { sort: nextSort, rating: nextStar || undefined, limit: PAGE_SIZE, offset })
      .then((data) => {
        if (seq !== requestSeq.current) return;
        setReviews((prev) => (offset > 0 && prev ? [...prev, ...data.reviews] : data.reviews));
        // An older backend (mid-deploy) has no summary: show an empty one rather than crash.
        setSummary(data.summary || EMPTY_SUMMARY);
        setTotal(data.total);
        setHasMore(data.hasMore);
        if (data.summary) onSummary?.(data.summary);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        if (offset === 0) setReviews([]);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoadingMore(false);
      });
  }

  function changeSort(value) {
    setSort(value);
    loadReviews({ nextSort: value });
  }

  function changeStar(value) {
    setStarFilter(value);
    loadReviews({ nextStar: value });
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
          <span className="product-reviews-summary-number">{summary.count ? summary.average.toFixed(1) : '—'}</span>
          <span className="product-reviews-summary-stars" aria-hidden="true">
            {'★'.repeat(Math.round(summary.average))}
            {'☆'.repeat(5 - Math.round(summary.average))}
          </span>
          <span className="product-reviews-summary-count">
            {summary.count} review{summary.count === 1 ? '' : 's'}
          </span>
        </div>
        <div className="product-reviews-summary-bars">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.breakdown[stars] || 0;
            const pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
            return (
              <div className="product-reviews-bar-row" key={stars}>
                <span className="product-reviews-bar-label">{stars}★</span>
                <span className="product-reviews-bar-track">
                  <span className="product-reviews-bar-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="product-reviews-bar-pct">{count}</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary product-reviews-write-btn" onClick={handleWriteReviewClick}>
          <PenLine size={15} /> {myReview ? 'Edit Review' : 'Write a Review'}
        </button>
      </div>

      {summary.count > 0 && (
        <div className="product-reviews-controls">
          <div className="product-reviews-filter" role="group" aria-label="Filter by star rating">
            {[0, 5, 4, 3, 2, 1].map((n) => (
              <button
                key={n}
                type="button"
                className={`product-reviews-chip ${starFilter === n ? 'active' : ''}`}
                aria-pressed={starFilter === n}
                onClick={() => changeStar(n)}
                disabled={n > 0 && !summary.breakdown[n]}
              >
                {n === 0 ? 'All' : `${n}★`}
              </button>
            ))}
          </div>
          <label className="product-reviews-sort">
            <span>Sort by</span>
            <select value={sort} onChange={(e) => changeSort(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {reviews === null && <p className="text-body-sm">Loading reviews…</p>}

      {reviews && summary.count === 0 && (
        <p className="text-body-sm product-reviews-empty">No reviews yet — be the first to share your experience.</p>
      )}

      {reviews && summary.count > 0 && reviews.length === 0 && (
        <p className="text-body-sm product-reviews-empty">No {starFilter}-star reviews.</p>
      )}

      {reviews && reviews.length > 0 && (
        <>
          <div className="product-reviews-list">
            {reviews.map((r) => (
              <div key={r.reviewId} className="product-review-item">
                <div className="product-review-item-top">
                  <span className="product-review-stars" role="img" aria-label={`${r.rating} out of 5 stars`}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </span>
                  <span className="product-review-author">{r.userName}</span>
                  {r.verifiedPurchase && (
                    <span className="product-review-verified">
                      <BadgeCheck size={13} aria-hidden="true" /> Verified Purchase
                    </span>
                  )}
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
          <div className="product-reviews-more">
            <p className="text-body-sm">Showing {reviews.length} of {total}</p>
            {hasMore && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => loadReviews({ offset: reviews.length })}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 size={16} className="btn-spinner" /> : 'Load more reviews'}
              </button>
            )}
          </div>
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
