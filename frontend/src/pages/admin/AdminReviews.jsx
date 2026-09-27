import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import './Admin.css';

const PAGE_SIZE = 20;

export function AdminReviews() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [reviews, setReviews] = useState(null);
  const [productNames, setProductNames] = useState({});

  function load() {
    adminService
      .reviews()
      .then((data) => setReviews(data.reviews))
      .catch(() => setReviews([]));
  }

  useEffect(load, []);
  const { page, setPage, totalPages, pageItems: pageReviews, total: totalReviews, rangeStart, rangeEnd } =
    usePagination(reviews, PAGE_SIZE);
  useEffect(() => {
    productService
      .list()
      .then((data) => setProductNames(Object.fromEntries(data.products.map((p) => [p.productId, p.name]))))
      .catch(() => {});
  }, []);

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

      {!reviews && <Loader label="Loading reviews…" />}
      {reviews && reviews.length === 0 && <EmptyState title="No reviews yet" />}

      {reviews && reviews.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Reviewer</th>
                <th>Comment</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageReviews.map((r) => (
                <tr key={r.reviewId}>
                  <td>{productNames[r.productId] || r.productId}</td>
                  <td>{'★'.repeat(r.rating)}</td>
                  <td>{r.userName}</td>
                  <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{r.title && <strong>{r.title}: </strong>}{r.comment}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.reviewId)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalReviews}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="reviews"
          />
        </div>
      )}
    </div>
  );
}
