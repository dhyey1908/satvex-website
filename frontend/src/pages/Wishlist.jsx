import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { ProductGrid } from '../components/ProductGrid';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Wishlist.css';

const PAGE_SIZE = 12;

async function shareWishlist(showToast) {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'My Satvex Wishlist', url });
    } catch {
      // user cancelled the native share sheet — not an error
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard', 'success');
  } catch {
    showToast('Could not copy link', 'error');
  }
}

export function Wishlist() {
  useDocumentMeta({ title: 'Wishlist', path: '/wishlist', noindex: true });

  const { items, loading, removeItem } = useWishlist();
  const { showToast } = useToast();
  const { page, setPage, totalPages, pageItems, total, rangeStart, rangeEnd } = usePagination(items, PAGE_SIZE);

  async function handleRemove(productId) {
    try {
      await removeItem(productId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!loading && items.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Your wishlist is waiting"
          message="Discover something beautiful from Satvex."
          action={
            <Link to="/shop" className="btn btn-primary">
              Browse Products
            </Link>
          }
        />
      </div>
    );
  }

  const availableItems = pageItems.filter((item) => item.available !== false);
  const unavailableItems = pageItems.filter((item) => item.available === false);

  return (
    <div className="container section">
      <PageHeader eyebrow="Wishlist" title="Your Wishlist" count={items.length} countLabel="items">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => shareWishlist(showToast)}>
          Share Wishlist
        </button>
      </PageHeader>

      {/* Same shared grid + ProductCard used on Home/Shop/Search — the
          wishlist is just another product listing, not a bespoke card. */}
      <ProductGrid products={availableItems} loading={loading && items.length === 0} skeletonCount={3} />

      {unavailableItems.length > 0 && (
        <div className="wishlist-unavailable-list">
          <AnimatePresence>
            {unavailableItems.map((item) => (
              <motion.div
                key={item.productId}
                className="wishlist-unavailable-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                transition={{ duration: 0.25 }}
              >
                <p>This product is no longer available.</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemove(item.productId)}>
                  <X size={14} /> Remove
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={total}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        itemLabel="items"
      />
    </div>
  );
}
