import { useEffect, useState } from 'react';
import { Check, X, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

const FILTERS = ['pending', 'approved', 'rejected', 'all'];

export function AdminReviews() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [reviews, setReviews] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [productNames, setProductNames] = useState({});

  function load() {
    adminService
      .reviews(filter === 'all' ? {} : { status: filter })
      .then((data) => setReviews(data.reviews))
      .catch(() => setReviews([]));
  }

  useEffect(load, [filter]);
  useEffect(() => {
    productService
      .list()
      .then((data) => setProductNames(Object.fromEntries(data.products.map((p) => [p.productId, p.name]))))
      .catch(() => {});
  }, []);

  async function moderate(id, status) {
    try {
      await adminService.moderateReview(id, status);
      showToast(`Review ${status}`, 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

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
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Reviews</h1>
      </div>

      <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f === 'all' ? 'All statuses' : f.charAt(0).toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
      </form>

      {!reviews && <Loader label="Loading reviews…" />}
      {reviews && reviews.length === 0 && <EmptyState title={`No ${filter === 'all' ? '' : filter} reviews`} />}

      {reviews && reviews.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Reviewer</th>
                <th>Comment</th>
                <th>Status</th>
                <th>Date</th>
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
                  <td>
                    <span className={`pill ${r.status === 'approved' ? 'pill-active' : 'pill-inactive'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    {r.status !== 'approved' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moderate(r.reviewId, 'approved')}>
                        <Check size={14} /> Approve
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moderate(r.reviewId, 'rejected')}>
                        <X size={14} /> Reject
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.reviewId)}>
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
