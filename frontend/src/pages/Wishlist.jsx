import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { WishlistCard } from '../components/WishlistCard';
import { VariantPickerModal } from '../components/VariantPickerModal';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Loader';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Wishlist.css';

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
  useDocumentMeta({ title: 'Wishlist', path: '/wishlist' });

  const { items, loading, removeItem } = useWishlist();
  const { showToast } = useToast();
  const [modalProductId, setModalProductId] = useState(null);

  async function handleRemove(productId) {
    try {
      await removeItem(productId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="container section">
        <PageHeader eyebrow="Wishlist" title="Your Wishlist" />
        <div className="wishlist-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height="340px" style={{ borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
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

  return (
    <div className="container section">
      <PageHeader eyebrow="Wishlist" title="Your Wishlist" count={items.length} countLabel="items">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => shareWishlist(showToast)}>
          Share Wishlist
        </button>
      </PageHeader>

      <div className="wishlist-grid">
        <AnimatePresence>
          {items.map((item) => (
            <WishlistCard
              key={item.productId}
              item={item}
              onAddToCart={() => setModalProductId(item.productId)}
              onRemove={() => handleRemove(item.productId)}
            />
          ))}
        </AnimatePresence>
      </div>

      <VariantPickerModal
        productId={modalProductId}
        open={Boolean(modalProductId)}
        onClose={() => setModalProductId(null)}
      />
    </div>
  );
}
