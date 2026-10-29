import { useEffect, useState } from 'react';
import { Package, Star, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { RowMenu } from '../../components/admin/RowMenu';
import { useAdminList } from '../../hooks/useAdminList';
import { formatShortDateTime } from '../../utils/dateRange';
import './Admin.css';
import './AdminLists.css';

const LIST_DEFAULTS = { sortBy: 'createdAt', sortDir: 'desc', filters: { rating: '', productId: '', dateFrom: '', dateTo: '' } };

// A review can only be written after the reviewer received the product (the
// create endpoint enforces it), so every review here is a verified purchase —
// there's nothing to sort or filter on for that.
export function AdminReviews() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
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
    { key: 'reviewer', header: 'Reviewer', render: (r) => r.userName },
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
      <PageHeader title="Reviews" subtitle={reviews ? countLabel(total, 'review') : ' '} />
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
    </div>
  );
}
