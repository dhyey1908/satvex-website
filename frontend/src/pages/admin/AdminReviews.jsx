import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, DateFilter, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDate } from '../../utils/date';
import './Admin.css';

const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { rating: '', productId: '', dateFrom: '', dateTo: '' },
};

// A review can only be written after the reviewer received the product (the
// create endpoint enforces it), so every review here is a verified purchase —
// there's nothing to sort or filter on for that.
export function AdminReviews() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const list = useAdminList({
    fetcher: adminService.reviews,
    resultKey: 'reviews',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: reviews, filters, setFilter } = list;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };

  useEffect(() => {
    productService
      .list()
      .then((data) => setProducts(data.products.map((p) => ({ productId: p.productId, name: p.name }))))
      .catch(() => {});
  }, []);

  const productNames = Object.fromEntries(products.map((p) => [p.productId, p.name]));

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Delete this review?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminService.deleteReview(id);
      showToast('Review deleted', 'success');
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Reviews</h1>
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by reviewer or comment…"
          label="Search reviews"
        />
        <select value={filters.rating} onChange={(e) => setFilter('rating', e.target.value)} aria-label="Rating">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>
          ))}
        </select>
        {products.length > 1 && (
          <select value={filters.productId} onChange={(e) => setFilter('productId', e.target.value)} aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>{p.name}</option>
            ))}
          </select>
        )}
        <DateFilter label="From" value={filters.dateFrom} max={filters.dateTo} onChange={(v) => setFilter('dateFrom', v)} />
        <DateFilter label="To" value={filters.dateTo} min={filters.dateFrom} onChange={(v) => setFilter('dateTo', v)} />
        <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
      </div>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && !reviews && <Loader label="Loading reviews…" />}
      {!list.error && reviews?.length === 0 && (
        <EmptyState
          title={list.hasActiveFilters ? 'No reviews match these filters' : 'No reviews yet'}
          message={list.hasActiveFilters ? 'Try a different search or reset the filters.' : undefined}
        />
      )}

      {!list.error && reviews?.length > 0 && (
        <>
          <ResultCount pagination={list.pagination} loading={list.loading} label="reviews" />
          <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <SortableTh label="Rating" field="rating" firstDir="desc" {...sortProps} />
                  <th>Reviewer</th>
                  <th>Comment</th>
                  <SortableTh label="Date" field="createdAt" firstDir="desc" {...sortProps} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.reviewId}>
                    <td>{productNames[r.productId] || r.productId}</td>
                    <td>{'★'.repeat(r.rating)}</td>
                    <td>{r.userName}</td>
                    <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{r.title && <strong>{r.title}: </strong>}{r.comment}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.reviewId)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="reviews" />}
          </div>
        </>
      )}
    </div>
  );
}
