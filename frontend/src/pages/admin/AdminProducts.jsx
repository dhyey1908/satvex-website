import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Power } from 'lucide-react';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

const STATUS_FILTERS = ['All', 'Active', 'Inactive', 'Featured'];

export function AdminProducts() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const { showToast } = useToast();
  const confirm = useConfirm();

  function load() {
    setError(null);
    productService
      .list()
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    if (!products) return null;
    let list = products;
    if (status === 'Active') list = list.filter((p) => p.isActive);
    else if (status === 'Inactive') list = list.filter((p) => !p.isActive);
    else if (status === 'Featured') list = list.filter((p) => p.isFeatured);
    const term = search.trim().toLowerCase();
    if (term) list = list.filter((p) => p.name.toLowerCase().includes(term));
    return list;
  }, [products, search, status]);

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
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function toggleActive(product) {
    try {
      await productService.update(product.productId, { isActive: !product.isActive });
      showToast(product.isActive ? 'Product deactivated' : 'Product activated', 'success');
      load();
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

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !products && <Loader label="Loading products…" />}
      {!error && products?.length === 0 && <EmptyState title="No products yet" />}

      {!error && products?.length > 0 && (
        <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
          <input
            placeholder="Search by product name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </form>
      )}

      {!error && products?.length > 0 && visible?.length === 0 && (
        <EmptyState title="No products match your search" />
      )}

      {!error && visible?.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Base Price</th>
                <th>Featured</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.productId}>
                  <td>{p.name}</td>
                  <td>₹{p.basePrice}</td>
                  <td>{p.isFeatured ? 'Yes' : '—'}</td>
                  <td>
                    <span className={`pill ${p.isActive ? 'pill-active' : 'pill-inactive'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
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
        </div>
      )}
    </div>
  );
}
