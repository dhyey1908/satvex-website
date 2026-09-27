import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productService } from '../services/productService';
import { ImagePlaceholder } from './ImagePlaceholder';
import './SearchOverlay.css';

export function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [allProducts, setAllProducts] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (open && !allProducts) {
      productService.list().then((data) => setAllProducts(data.products)).catch(() => setAllProducts([]));
    }
  }, [open, allProducts]);

  if (!open) return null;

  const term = query.trim().toLowerCase();
  const matches = term
    ? (allProducts || []).filter(
        (p) => p.name.toLowerCase().includes(term) || p.shortDescription.toLowerCase().includes(term)
      )
    : [];

  function goToResults(e) {
    e?.preventDefault();
    navigate(`/shop${term ? `?search=${encodeURIComponent(term)}` : ''}`);
    onClose();
  }

  return (
    <div className="search-overlay-backdrop" onClick={onClose}>
      <div className="search-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={goToResults} className="search-overlay-form">
          <input
            ref={inputRef}
            type="search"
            placeholder="Search Satvex…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
        </form>

        {term && (
          <div className="search-overlay-results">
            {matches.slice(0, 5).map((p) => (
              <Link key={p.productId} to={`/product/${p.slug}`} className="search-overlay-result" onClick={onClose}>
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
      </div>
    </div>
  );
}
