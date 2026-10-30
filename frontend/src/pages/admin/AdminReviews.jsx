import { useEffect, useState } from 'react';
import { Package, Plus, Star, Trash2, X } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ErrorState } from '../../components/ErrorState';
import { Modal } from '../../components/Modal';
import { UploadZone } from '../../components/UploadZone';
import { DateRangePicker } from '../../components/admin/DateRangePicker';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { RowMenu } from '../../components/admin/RowMenu';
import { useAdminList } from '../../hooks/useAdminList';
import { formatShortDateTime, todayIST } from '../../utils/dateRange';
import './Admin.css';
import './AdminLists.css';

const LIST_DEFAULTS = { sortBy: 'createdAt', sortDir: 'desc', filters: { rating: '', productId: '', dateFrom: '', dateTo: '' } };

const MAX_PHOTOS = 3;
const EMPTY_REVIEW = { productId: '', userName: '', rating: 5, title: '', comment: '', images: [], date: '', verifiedPurchase: true };

// Customers can only review after delivery (those carry the Verified Purchase badge).
// The owner can also type in a genuine review received elsewhere (WhatsApp, Instagram...):
// it is shown and counted, labelled "Added by you" here, and carries the Verified Purchase
// badge when the owner confirms that customer bought the product (ticked by default).
export function AdminReviews() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_REVIEW);
  const [saving, setSaving] = useState(false);
  const list = useAdminList({ fetcher: adminService.reviews, resultKey: 'reviews', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: reviews, filters, setFilter } = list;
  const total = list.pagination?.total ?? 0;

  useEffect(() => {
    productService
      .list()
      .then((data) => setProducts(data.products.map((p) => ({ productId: p.productId, name: p.name }))))
      .catch(() => {});
  }, []);

  const productNames = Object.fromEntries(products.map((p) => [p.productId, p.name]));

  function openAdd() {
    setForm({ ...EMPTY_REVIEW, productId: products[0]?.productId || '' });
    setAdding(true);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (form.userName.trim().length < 2) return showToast('Enter the reviewer name.', 'error');
    if (!form.comment.trim()) return showToast('Write the review.', 'error');
    setSaving(true);
    try {
      await adminService.createReview({
        productId: form.productId,
        userName: form.userName.trim(),
        rating: form.rating,
        title: form.title.trim() || undefined,
        comment: form.comment.trim(),
        images: form.images,
        verifiedPurchase: form.verifiedPurchase,
        date: form.date || undefined,
      });
      showToast('Review added', 'success');
      setAdding(false);
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({ title: 'Delete this review?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await adminService.deleteReview(id);
      showToast('Review deleted', 'success');
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const columns = [
    { key: 'product', header: 'Product', className: 'ui-cell-primary', render: (r) => <span className="ui-cell-main">{productNames[r.productId] || r.productId}</span> },
    { key: 'rating', header: 'Rating', sortField: 'rating', firstDir: 'desc', render: (r) => <span aria-label={`${r.rating} stars`} style={{ color: 'var(--color-star)' }}>{'★'.repeat(r.rating)}<span className="ui-muted">{'★'.repeat(5 - r.rating)}</span></span> },
    {
      key: 'reviewer',
      header: 'Reviewer',
      render: (r) => (
        <>
          {r.userName}
          {r.addedByAdmin && <small className="ui-muted" style={{ display: 'block' }}>Added by you</small>}
        </>
      ),
    },
    {
      key: 'comment',
      header: 'Comment',
      render: (r) => (
        <span className="ui-cell-sub-clamp" style={{ margin: 0 }}>
          {r.title && <strong>{r.title}: </strong>}
          {r.comment}
        </span>
      ),
    },
    { key: 'date', header: 'Date', sortField: 'createdAt', firstDir: 'desc', render: (r) => formatShortDateTime(r.createdAt) },
    { key: 'menu', header: '', className: 'ui-cell-actions', render: (r) => <RowMenu items={[{ label: 'Delete review', icon: Trash2, danger: true, onClick: () => handleDelete(r.reviewId) }]} /> },
  ];

  const chips = [
    { key: 'rating', label: 'Rating', icon: Star, options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} (${n})` })) },
  ];
  if (products.length > 1) chips.push({ key: 'productId', label: 'Product', icon: Package, options: products.map((p) => ({ value: p.productId, label: p.name })) });

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle={reviews ? countLabel(total, 'review') : ' '}
        actions={
          <button type="button" className="btn btn-primary" onClick={openAdd} disabled={products.length === 0}>
            <Plus size={16} /> Add review
          </button>
        }
      />
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search reviewer or comment…' }}
        chips={chips}
        values={filters}
        onChange={setFilter}
        date={{ label: 'Date', from: filters.dateFrom, to: filters.dateTo, onChange: ({ from, to }) => { setFilter('dateFrom', from); setFilter('dateTo', to); } }}
        onClearAll={list.clearFilters}
        resultText={reviews ? `Showing ${reviews.length} of ${total} reviews` : null}
        searchLabel="Search reviews"
      />
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={reviews}
            rowKey={(r) => r.reviewId}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            caption="Reviews"
            empty={
              <TableEmpty
                icon={Star}
                title={list.hasActiveFilters ? 'No reviews match these filters' : 'No reviews yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Reviews from customers who received their order show up here.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="reviews" />
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a customer review">
        <form onSubmit={handleAdd} noValidate>
          <p className="field-hint">Only add real reviews you received from customers (WhatsApp, Instagram, email…). They are shown on the product page.</p>
          {products.length > 1 && (
            <div className="field">
              <label htmlFor="rv-product">Product</label>
              <select id="rv-product" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                {products.map((p) => <option key={p.productId} value={p.productId}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="rv-name">Reviewer name</label>
            <input id="rv-name" required maxLength={60} value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} placeholder="e.g. Priya S." />
          </div>
          <div className="field">
            <label id="rv-rating-label">Rating</label>
            <div role="group" aria-labelledby="rv-rating-label" style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="ui-icon-btn"
                  aria-pressed={form.rating === n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setForm({ ...form, rating: n })}
                  style={{ color: n <= form.rating ? 'var(--color-star)' : 'var(--color-border)', fontSize: '1.5rem', lineHeight: 1 }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="rv-title">Title (optional)</label>
            <input id="rv-title" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="rv-comment">Review</label>
            <textarea id="rv-comment" required rows={4} maxLength={2000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>
          <div className="field">
            <label>Photos from the customer (optional, up to {MAX_PHOTOS})</label>
            {form.images.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                {form.images.map((url, i) => (
                  <div key={url} style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      className="ui-icon-btn"
                      aria-label="Remove photo"
                      onClick={() => setForm({ ...form, images: form.images.filter((_, n) => n !== i) })}
                      style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, background: 'var(--color-surface)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.images.length < MAX_PHOTOS && (
              <UploadZone
                folder="reviews"
                maxFiles={MAX_PHOTOS - form.images.length}
                onUploaded={(url) => setForm((f) => (f.images.length < MAX_PHOTOS ? { ...f, images: [...f.images, url] } : f))}
                label="Drop photos here or click to upload"
              />
            )}
          </div>
          <div className="field">
            <label>Date the customer wrote it (optional)</label>
            <DateRangePicker
              mode="single"
              label="Review date"
              emptyText="Today"
              from={form.date}
              to={form.date}
              max={todayIST()}
              onChange={({ from }) => setForm({ ...form, date: from })}
              fullWidth
            />
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.verifiedPurchase} onChange={(e) => setForm({ ...form, verifiedPurchase: e.target.checked })} />
            <span>This customer bought the product (shows the &quot;Verified Purchase&quot; badge)</span>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Adding…' : 'Add review'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
