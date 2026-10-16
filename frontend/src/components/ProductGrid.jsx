import { motion } from 'framer-motion';
import { ProductCard } from './ProductCard';
import { BrandLoader } from './BrandLoader';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { EmptyState } from './EmptyState';
import { fadeUp } from '../motion';
import './ProductGrid.css';

/**
 * Shared responsive product grid used on Home, Shop, Wishlist and Search
 * results. Deliberately does NOT use stretchy 1fr auto-fill tracks — with a
 * small catalog that leaves a single card stretched across a huge empty row.
 * Fixed-width tracks + justify-content:start give consistent card sizing
 * that wraps naturally to 3-4/2-3/2 columns as more products are added,
 * without ever looking like "one small card in a big empty area."
 */
export function ProductGrid({ products, loading, emptyTitle = 'No products found', emptyMessage }) {
  const holdLoader = useMinimumLoading(Boolean(loading));
  if (loading || holdLoader) {
    return <BrandLoader variant="section" label="Loading products…" />;
  }

  if (!products || products.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <motion.div
      className="product-grid"
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-40px' }}
      transition={{ staggerChildren: 0.05 }}
    >
      {products.map((p) => (
        <motion.div key={p.productId} variants={fadeUp}>
          <ProductCard product={p} />
        </motion.div>
      ))}
    </motion.div>
  );
}
