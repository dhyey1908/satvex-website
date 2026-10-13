import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { productService } from '../services/productService';
import { ImagePlaceholder } from './ImagePlaceholder';
import './SearchOverlay.css';

/**
 * Self-contained header search — owns its own open state and renders its
 * own trigger button (same pattern as AccountMenu), so outside-click /
 * Escape handling can be scoped to one ref that wraps both the trigger and
 * the dropdown. That's what makes "click the icon to toggle" and "click
 * anywhere else to close" work without conflicting with each other.
 */
export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allProducts, setAllProducts] = useState(null);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (open && !allProducts) {
      productService.list().then((data) => setAllProducts(data.products)).catch(() => setAllProducts([]));
    }
  }, [open, allProducts]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const term = query.trim().toLowerCase();
  const matches = term
    ? (allProducts || []).filter(
        (p) => p.name.toLowerCase().includes(term) || p.shortDescription.toLowerCase().includes(term)
      )
    : [];

  function close() {
    setOpen(false);
  }

  function goToResults(e) {
    e?.preventDefault();
    navigate(`/shop${term ? `?search=${encodeURIComponent(term)}` : ''}`);
    close();
  }

  return (
    <div className="header-search" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn ${open ? 'active' : ''}`}
        aria-label="Search"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Search size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="search-overlay-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <form onSubmit={goToResults} className="search-overlay-form input-shell">
              <Search size={16} className="search-overlay-form-icon" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Search Satvex…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search products"
              />
              <button type="button" className="search-overlay-close" onClick={close} aria-label="Close search">
                <X size={16} />
              </button>
            </form>

            {term && (
              <div className="search-overlay-results">
                {matches.slice(0, 5).map((p) => (
                  <Link key={p.productId} to={`/product/${p.slug}`} className="search-overlay-result" onClick={close}>
                    {p.images?.[0] ? <img src={p.images[0]} alt={p.name} /> : <ImagePlaceholder />}
                    <div>
                      <p className="search-overlay-result-name">{p.name}</p>
                      <p className="search-overlay-result-price">From ₹{p.basePrice}</p>
                    </div>
                  </Link>
                ))}
                {matches.length === 0 && <p className="search-overlay-empty">No products match &ldquo;{query}&rdquo;.</p>}
                {matches.length > 0 && (
                  <button type="button" className="search-overlay-view-all" onClick={goToResults}>
                    View all {matches.length} result{matches.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
