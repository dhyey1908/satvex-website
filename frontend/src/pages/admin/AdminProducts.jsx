import { Link, useNavigate } from 'react-router-dom';
import { Package, Palette, Pencil, Plus, Power, Trash2, Layers } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { RowMenu } from '../../components/admin/RowMenu';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDay } from '../../utils/dateRange';
import './Admin.css';
import './AdminLists.css';

const LIST_DEFAULTS = { sortBy: 'createdAt', sortDir: 'desc', filters: { status: '', color: '', stock: '' } };

const STOCK_LABELS = { in_stock: 'In stock', partial: 'Some colours out', out_of_stock: 'Out of stock' };
const STOCK_TONE = { in_stock: 'green', partial: 'amber', out_of_stock: 'red' };
const day = (iso) => (iso ? formatDay(new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)) : '—');

export function AdminProducts() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const list = useAdminList({ fetcher: adminService.products, resultKey: 'products', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: products, filters, setFilter, facets } = list;
  const total = list.pagination?.total ?? 0;

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

  const columns = [
    { key: 'name', header: 'Name', sortField: 'name', className: 'ui-cell-primary', render: (p) => <span className="ui-cell-main">{p.name}</span> },
    { key: 'price', header: 'Price', sortField: 'price', className: 'ui-num', render: (p) => `₹${p.listing?.price ?? p.basePrice}` },
    { key: 'discount', header: 'Discount', sortField: 'discount', firstDir: 'desc', className: 'ui-num', render: (p) => (p.listing?.discountPercent > 0 ? `${p.listing.discountPercent}% off` : <span className="ui-muted">—</span>) },
    {
      key: 'availability',
      header: 'Availability',
      sortField: 'availability',
      render: (p) => {
        const s = p.listing?.stockStatus;
        return s ? <StatusBadge tone={STOCK_TONE[s]} label={STOCK_LABELS[s]} /> : <span className="ui-muted">—</span>;
      },
    },
    { key: 'featured', header: 'Featured', render: (p) => (p.isFeatured ? 'Yes' : <span className="ui-muted">—</span>) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge tone={p.isActive ? 'green' : 'grey'} label={p.isActive ? 'Active' : 'Inactive'} /> },
    { key: 'added', header: 'Added', sortField: 'createdAt', firstDir: 'desc', render: (p) => day(p.createdAt) },
    {
      key: 'menu',
      header: '',
      className: 'ui-cell-actions',
      render: (p) => (
        <RowMenu
          items={[
            { label: 'Edit', icon: Pencil, onClick: () => navigate(`/admin/products/${p.productId}`) },
            { label: p.isActive ? 'Deactivate' : 'Activate', icon: Power, onClick: () => toggleActive(p) },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => handleDelete(p) },
          ]}
        />
      ),
    },
  ];

  const chips = [
    { key: 'status', label: 'Status', icon: Package, options: [{ value: 'active', label: 'Active', tone: 'green' }, { value: 'inactive', label: 'Inactive', tone: 'grey' }, { value: 'featured', label: 'Featured' }] },
    { key: 'stock', label: 'Stock', icon: Layers, options: Object.entries(STOCK_LABELS).map(([value, label]) => ({ value, label, tone: STOCK_TONE[value] })) },
  ];
  if (facets.colors?.length) chips.push({ key: 'color', label: 'Colour', icon: Palette, options: facets.colors.map((c) => ({ value: c, label: c })) });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={products ? countLabel(total, 'product') : ' '}
        actions={
          <Link to="/admin/products/new" className="btn btn-primary btn-sm">
            <Plus size={16} /> Add product
          </Link>
        }
      />
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search product name…' }}
        chips={chips}
        values={filters}
        onChange={setFilter}
        onClearAll={list.clearFilters}
        resultText={products ? `Showing ${products.length} of ${total} products` : null}
        searchLabel="Search products"
      />
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={products}
            rowKey={(p) => p.productId}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            onRowClick={(p) => navigate(`/admin/products/${p.productId}`)}
            caption="Products"
            empty={
              <TableEmpty
                icon={Package}
                title={list.hasActiveFilters ? 'No products match these filters' : 'No products yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Add your first product to get started.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="products" />
        </>
      )}
    </div>
  );
}
