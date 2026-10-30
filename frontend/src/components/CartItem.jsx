import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Trash2, Bookmark, ShoppingBag, Palette } from 'lucide-react';
import { listItem } from '../motion';
import { PriceDisplay } from './PriceDisplay';
import { ColorChips } from './ColorChips';
import { EditColoursModal } from './EditColoursModal';
import { itemImage } from '../utils/itemImage';
import './CartItem.css';

export function CartItem({ item, catalog, onQuantityChange, onEditColours, onRemove, onSaveForLater, onMoveToCart }) {
  const [editing, setEditing] = useState(false);
  const product = catalog?.find((p) => p.productId === item.productId);
  const image = itemImage(item, catalog);

  return (
    <motion.div
      className="cart-item"
      layout
      initial={listItem.initial}
      animate={listItem.animate}
      exit={listItem.exit}
    >
      <Link to={`/product/${item.productSlug}`} className="cart-item-image">
        {image && <img src={image} alt={`${item.productName} in ${item.selectedColorDetails?.[0]?.colorName || 'your chosen colour'}`} loading="lazy" />}
      </Link>

      <div className="cart-item-info">
        <Link to={`/product/${item.productSlug}`}>
          <h4>{item.productName}</h4>
        </Link>
        <p className="cart-item-option">{item.sellingOptionName}</p>
        {item.freeQuantity > 0 && (
          <p className="cart-item-free">{item.freeQuantity} free {item.freeQuantity === 1 ? 'piece' : 'pieces'} included</p>
        )}
        {item.compareAtPrice > item.unitPrice && (
          <div className="cart-item-unit-price">
            <PriceDisplay price={item.unitPrice} compareAtPrice={item.compareAtPrice} size="md" /> each
          </div>
        )}

        <div className="cart-item-colors-row">
          {item.selectedColorDetails?.length > 0 ? (
            <ColorChips item={item} catalog={catalog} />
          ) : (
            <p className="cart-item-colors">{item.selectedColors?.length} color(s) selected</p>
          )}
          {onEditColours && (
            <button type="button" className="cart-item-link" onClick={() => setEditing(true)}>
              <Palette size={14} aria-hidden="true" /> Edit colours
            </button>
          )}
        </div>

        <div className="cart-item-controls">
          {onQuantityChange && (
            <div className="cart-item-qty">
              <span className="cart-item-qty-label" id={`qty-${item.cartItemId}`}>Combos</span>
              <div className="qty-stepper" role="group" aria-labelledby={`qty-${item.cartItemId}`}>
                <button type="button" onClick={() => onQuantityChange(Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1} aria-label="Decrease number of combos">
                  <Minus size={14} />
                </button>
                <span className="qty-stepper-value">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={item.quantity}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                    >
                      {item.quantity}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <button type="button" onClick={() => onQuantityChange(item.quantity + 1)} aria-label="Increase number of combos">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="cart-item-actions">
            {onSaveForLater && (
              <button type="button" className="cart-item-link" onClick={onSaveForLater}>
                <Bookmark size={14} aria-hidden="true" /> Save for later
              </button>
            )}
            {onMoveToCart && (
              <button type="button" className="cart-item-link" onClick={onMoveToCart}>
                <ShoppingBag size={14} aria-hidden="true" /> Move to cart
              </button>
            )}
            <button type="button" className="cart-item-link cart-item-remove" onClick={onRemove}>
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      </div>

      <div className="cart-item-price">₹{item.subtotal.toFixed(2)}</div>

      {onEditColours && (
        <EditColoursModal
          open={editing}
          onClose={() => setEditing(false)}
          item={item}
          product={product}
          onSave={onEditColours}
        />
      )}
    </motion.div>
  );
}
