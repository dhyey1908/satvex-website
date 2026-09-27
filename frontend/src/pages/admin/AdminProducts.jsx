import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

export function AdminProducts() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
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
          + Add Product
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !products && <Loader label="Loading products…" />}
      {!error && products?.length === 0 && <EmptyState title="No products yet" />}

      {!error && products?.length > 0 && (
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
              {products.map((p) => (
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
                      Edit
                    </Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)}>
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(p)}>
                      Delete
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
