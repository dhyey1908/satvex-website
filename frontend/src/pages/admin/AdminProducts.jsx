import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Power } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDate } from '../../utils/date';
import './Admin.css';

const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { status: '', color: '', stock: '' },
};

const STOCK_LABELS = {
  in_stock: 'In stock',
  partial: 'Some colours out',
  out_of_stock: 'Out of stock',
};
const STOCK_PILL = { in_stock: 'pill-active', partial: 'pill-warning', out_of_stock: 'pill-danger' };

export function AdminProducts() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const list = useAdminList({
    fetcher: adminService.products,
    resultKey: 'products',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: products, filters, setFilter, facets } = list;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };

  async function handleDelete(product) {
    const ok = await confirm({
      title: `Delete "${product.name}"?`,
      message: 'This product will be permanently removed from your catalog. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await productService.remove(product.productId);
      showToast('Product deleted', 'success');
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function toggleActive(product) {
    try {
      await productService.update(product.productId, { isActive: !product.isActive });
      showToast(product.isActive ? 'Product deactivated' : 'Product activated', 'success');
      list.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Products</h1>
        <Link to="/admin/products/new" className="btn btn-primary">
          <Plus size={16} /> Add Product
        </Link>
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by product name…"
          label="Search products"
        />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="featured">Featured</option>
        </select>
        <select value={filters.stock} onChange={(e) => setFilter('stock', e.target.value)} aria-label="Stock">
          <option value="">Any stock</option>
          <option value="in_stock">In stock</option>
          <option value="partial">Some colours out</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
        {facets.colors?.length > 0 && (
          <select value={filters.color} onChange={(e) => setFilter('color', e.target.value)} aria-label="Colour">
            <option value="">All colours</option>
            {facets.colors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
      </div>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && !products && <Loader label="Loading products…" />}
      {!list.error && products?.length === 0 && (
        <EmptyState
          title={list.hasActiveFilters ? 'No products match these filters' : 'No products yet'}
          message={list.hasActiveFilters ? 'Try a different search or reset the filters.' : undefined}
        />
      )}

      {!list.error && products?.length > 0 && (
        <>
          <ResultCount pagination={list.pagination} loading={list.loading} label="products" />
          <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
            <table className="admin-table admin-table-compact">
              <thead>
                <tr>
                  <SortableTh label="Name" field="name" {...sortProps} />
                  <SortableTh label="Price" field="price" {...sortProps} />
                  <SortableTh label="Discount" field="discount" firstDir="desc" {...sortProps} />
                  <SortableTh label="Availability" field="availability" {...sortProps} />
                  <th>Featured</th>
                  <th>Status</th>
                  <SortableTh label="Added" field="createdAt" firstDir="desc" {...sortProps} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.name}</td>
                    <td>₹{p.listing?.price ?? p.basePrice}</td>
                    <td>{p.listing?.discountPercent > 0 ? `${p.listing.discountPercent}% off` : '—'}</td>
                    <td>
                      <span className={`pill ${STOCK_PILL[p.listing?.stockStatus] || 'pill-inactive'}`}>
                        {STOCK_LABELS[p.listing?.stockStatus] || '—'}
                      </span>
                    </td>
                    <td>{p.isFeatured ? 'Yes' : '—'}</td>
                    <td>
                      <span className={`pill ${p.isActive ? 'pill-active' : 'pill-inactive'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <Link to={`/admin/products/${p.productId}`} className="btn btn-ghost btn-sm">
                        <Pencil size={14} /> Edit
                      </Link>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)}>
                        <Power size={14} /> {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(p)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="products" />}
          </div>
        </>
      )}
    </div>
  );
}
