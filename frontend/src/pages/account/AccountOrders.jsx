import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderService } from '../../services/orderService';
import { reviewService } from '../../services/reviewService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useCart } from '../../context/CartContext';
import { OrderCard } from '../../components/OrderCard';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Loader';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import './Account.css';

const STATUSES = ['All', 'Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const PAGE_SIZE = 10;

export function AccountOrders() {
  useDocumentMeta({ title: 'My Orders', path: '/account/orders', noindex: true });

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { refresh: refreshCart } = useCart();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [reviewedProductIds, setReviewedProductIds] = useState(new Set());

  function load() {
    setError(null);
    orderService
      .list()
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);
  useEffect(() => {
    reviewService
      .listMine()
      .then((data) => setReviewedProductIds(new Set(data.reviews.map((r) => r.productId))))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    if (!orders) return null;
    let list = orders;
    if (status !== 'All') list = list.filter((o) => o.status === status);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((o) => o.orderId.toLowerCase().includes(term));
    }
    return list;
  }, [orders, status, search]);

  const { page, setPage, totalPages, pageItems, total: totalVisible, rangeStart, rangeEnd } =
    usePagination(visible, PAGE_SIZE);

  async function handleCancel(orderId) {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: 'This will cancel your order. This cannot be undone.',
      confirmLabel: 'Cancel Order',
      cancelLabel: 'Keep Order',
      danger: true,
    });
    if (!ok) return;
    try {
      await orderService.cancel(orderId);
      showToast('Order cancelled', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleReorder(orderId) {
    try {
      const { addedCount, unavailableCount } = await orderService.reorder(orderId);
      await refreshCart();
      showToast(
        unavailableCount > 0
          ? `Added ${addedCount} item(s) to cart, ${unavailableCount} unavailable`
          : `Added ${addedCount} item(s) to cart`,
        unavailableCount > 0 ? 'warning' : 'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader title="My Orders" count={orders?.length} countLabel="orders" />

      {orders && orders.length > 0 && (
        <div className="account-controls" style={{ marginBottom: 24 }}>
          <input
            type="search"
            placeholder="Search by order ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </option>
            ))}
          </select>
        </div>
      )}

      {!orders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="160px" style={{ borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      )}

      {orders && orders.length === 0 && (
        <EmptyState
          title="No orders yet"
          message="Your next favorite piece is waiting."
          action={
            <Link to="/shop" className="btn btn-primary">
              Shop Collection
            </Link>
          }
        />
      )}

      {visible && visible.length === 0 && orders.length > 0 && (
        <EmptyState title="No orders match your search" />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pageItems.map((order) => (
          <OrderCard
            key={order.orderId}
            order={order}
            onCancel={() => handleCancel(order.orderId)}
            onReorder={() => handleReorder(order.orderId)}
            reviewedProductIds={reviewedProductIds}
          />
        ))}
      </div>

      {visible && visible.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={totalVisible}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          itemLabel="orders"
        />
      )}
    </div>
  );
}
