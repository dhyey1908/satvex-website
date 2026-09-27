import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { productService } from '../services/productService';
import { ProductGrid } from '../components/ProductGrid';
import { PageHeader } from '../components/PageHeader';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import { usePagination } from '../hooks/usePagination';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './Shop.css';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Rating' },
];

function cheapestPrice(product) {
  const active = (product.sellingOptions || []).filter((o) => o.isActive);
  return active.reduce((min, o) => (min === null || o.price < min ? o.price : min), null) ?? product.basePrice;
}

export function Shop() {
  useDocumentMeta({
    title: 'Shop',
    description: 'Shop the full Satvex collection — thoughtfully designed essentials, sold single or as curated combos.',
    path: '/shop',
  });

  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search')?.trim().toLowerCase() || '';

  const [sort, setSort] = useState('featured');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [selectedColors, setSelectedColors] = useState([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef(null);

  useEffect(() => {
    if (!colorPickerOpen) return undefined;
    function onDocClick(e) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) setColorPickerOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setColorPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [colorPickerOpen]);

  function load() {
    setError(null);
    setProducts(null);
    productService
      .list()
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  const allColors = useMemo(() => {
    if (!products) return [];
    const map = new Map();
    products.forEach((p) =>
      (p.variants || [])
        .filter((v) => v.isActive)
        .forEach((v) => map.set(v.colorName, v.colorCode))
    );
    return Array.from(map.entries()).map(([colorName, colorCode]) => ({ colorName, colorCode }));
  }, [products]);

  const visible = useMemo(() => {
    if (!products) return null;
    let list = products;

    if (search) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(search) || p.shortDescription.toLowerCase().includes(search)
      );
    }
    if (inStockOnly) {
      list = list.filter((p) => p.isActive && (p.sellingOptions || []).some((o) => o.isActive));
    }
    if (selectedColors.length > 0) {
      list = list.filter((p) => (p.variants || []).some((v) => v.isActive && selectedColors.includes(v.colorName)));
    }

    const sorted = [...list];
    if (sort === 'price-asc') sorted.sort((a, b) => cheapestPrice(a) - cheapestPrice(b));
    else if (sort === 'price-desc') sorted.sort((a, b) => cheapestPrice(b) - cheapestPrice(a));
    else if (sort === 'rating') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === 'newest') sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    else sorted.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));

    return sorted;
  }, [products, search, sort, inStockOnly, selectedColors]);

  const { page, setPage, totalPages, pageItems, total: totalVisible, rangeStart, rangeEnd } =
    usePagination(visible, PAGE_SIZE);

  function toggleColor(colorName) {
    setSelectedColors((prev) =>
      prev.includes(colorName) ? prev.filter((c) => c !== colorName) : [...prev, colorName]
    );
  }

  function clearAll() {
    setSelectedColors([]);
    setInStockOnly(false);
    if (search) setSearchParams({});
  }

  const activeFilterCount = selectedColors.length + (inStockOnly ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="container section shop-page">
      <PageHeader eyebrow="Shop" title="All Products" count={visible?.length} countLabel="products" />
      <p className="shop-subcopy text-body-md">
        {products && products.length <= 1
          ? 'Thoughtfully designed, sold single or as a curated combo.'
          : 'The complete Satvex collection — thoughtfully designed essentials, sold single or as a curated combo.'}
      </p>

      <div className="shop-filter-bar">
        <div className="shop-filter-pills">
          <button
            type="button"
            className={`shop-pill ${inStockOnly ? 'active' : ''}`}
            onClick={() => setInStockOnly((v) => !v)}
          >
            <span className="shop-pill-dot" />
            In Stock Only
          </button>

          <div className="shop-color-picker" ref={colorPickerRef}>
            <button
              type="button"
              className={`shop-pill ${selectedColors.length > 0 ? 'active' : ''}`}
              onClick={() => setColorPickerOpen((v) => !v)}
            >
              Color {selectedColors.length > 0 && `(${selectedColors.length})`}
            </button>
            {colorPickerOpen && allColors.length > 0 && (
              <div className="shop-color-dropdown">
                {allColors.map(({ colorName, colorCode }) => (
                  <button
                    key={colorName}
                    type="button"
                    className={`shop-color-option ${selectedColors.includes(colorName) ? 'selected' : ''}`}
                    onClick={() => toggleColor(colorName)}
                  >
                    <span className="shop-color-dot" style={{ background: colorCode }} />
                    {colorName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {products && products.length > 1 && (
          <select className="shop-sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <AnimatePresence>
        {activeFilterCount > 0 && (
          <motion.div
            className="shop-active-filters"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="text-label-sm shop-active-label">Active:</span>
            {search && (
              <button type="button" className="shop-active-chip" onClick={() => setSearchParams({})}>
                &ldquo;{search}&rdquo; <X size={12} />
              </button>
            )}
            {inStockOnly && (
              <button type="button" className="shop-active-chip" onClick={() => setInStockOnly(false)}>
                In Stock <X size={12} />
              </button>
            )}
            {selectedColors.map((c) => (
              <button type="button" key={c} className="shop-active-chip" onClick={() => toggleColor(c)}>
                {c} <X size={12} />
              </button>
            ))}
            <button type="button" className="shop-clear-all" onClick={clearAll}>Clear All</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`shop-results ${visible?.length === 1 ? 'shop-single-product' : ''}`}>
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && (
          <ProductGrid
            products={pageItems}
            loading={!products}
            emptyTitle="No products found"
            emptyMessage="Try a different search term or filter."
          />
        )}
        {!error && products && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalVisible}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="products"
          />
        )}
      </div>
    </div>
  );
}
