import { ProductCard } from './ProductCard';
import { Skeleton } from './Loader';
import { EmptyState } from './EmptyState';
import './ProductGrid.css';

/**
 * Shared responsive product grid used on Home, Shop, Wishlist and Search
 * results. Deliberately does NOT use stretchy 1fr auto-fill tracks — with a
 * small catalog that leaves a single card stretched across a huge empty row.
 * Fixed-width tracks + justify-content:start give consistent card sizing
 * that wraps naturally to 3-4/2-3/2 columns as more products are added,
 * without ever looking like "one small card in a big empty area."
 */
export function ProductGrid({ products, loading, skeletonCount = 6, emptyTitle = 'No products found', emptyMessage }) {
  if (loading) {
    return (
      <div className="product-grid">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} height="380px" style={{ borderRadius: 'var(--radius-md)' }} />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.productId} product={p} />
      ))}
    </div>
  );
}
