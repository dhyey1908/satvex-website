import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { SellingOptionSelector } from './SellingOptionSelector';
import { ComboColorSelector } from './ComboColorSelector';
import { productService } from '../services/productService';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

/**
 * "Add to cart" for a product that needs a selling-option + color choice,
 * without leaving the current page. Used from Wishlist (and anywhere else a
 * quick-add makes sense). Fetches full product details on open (the summary
 * data on wishlist/cart list responses doesn't include variants/options).
 */
export function VariantPickerModal({ productId, open, onClose, onAdded }) {
  const { addItem } = useCart();
  const { showToast } = useToast();

  const [product, setProduct] = useState(null);
  const [sellingOptionId, setSellingOptionId] = useState(null);
  const [selectedColors, setSelectedColors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    setProduct(null);
    productService.getById(productId).then(({ product: p }) => {
      setProduct(p);
      const firstActive = p.sellingOptions.find((o) => o.isActive);
      setSellingOptionId(firstActive?.id ?? null);
      setSelectedColors([]);
    });
  }, [open, productId]);

  const sellingOption = product?.sellingOptions.find((o) => o.id === sellingOptionId);

  async function handleAdd() {
    if (!sellingOption || selectedColors.length !== sellingOption.quantity) {
      showToast(`Select ${sellingOption?.quantity ?? 1} color(s) to continue.`, 'error');
      return;
    }
    const variantsById = new Map(product.variants.map((v) => [v.id, v]));
    if (selectedColors.some((id) => variantsById.get(id)?.inStock === false)) {
      showToast('One or more selected colors are out of stock.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addItem({ productId, sellingOptionId: sellingOption.id, selectedColors, quantity: 1 });
      showToast('Added to cart', 'success');
      onAdded?.();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={product?.name || 'Select options'}>
      {!product && <p>Loading…</p>}
      {product && (
        <>
          <div className="field">
            <label>Selling Option</label>
            <SellingOptionSelector
              options={product.sellingOptions}
              selectedId={sellingOptionId}
              onSelect={(o) => {
                setSellingOptionId(o.id);
                setSelectedColors([]);
              }}
            />
          </div>
          {sellingOption && (
            <div className="field">
              <label>{sellingOption.quantity === 1 ? 'Choose a color' : `Choose ${sellingOption.quantity} colors`}</label>
              <ComboColorSelector
                variants={product.variants}
                requiredCount={sellingOption.quantity}
                allowDuplicateColors={sellingOption.allowDuplicateColors}
                selectedIds={selectedColors}
                onChange={setSelectedColors}
              />
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={submitting} onClick={handleAdd}>
            {submitting ? 'Adding…' : 'Add to Cart'}
          </button>
        </>
      )}
    </Modal>
  );
}
