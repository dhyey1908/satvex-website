import { Link } from 'react-router-dom';
import { ColorChips } from './ColorChips';
import { QuantitySelector } from './QuantitySelector';
import { itemImage } from '../utils/itemImage';

/**
 * The items listed inside an order summary: photo of the CHOSEN colour (first selected colour for a combo),
 * name (two lines at most), the pack ("Combo of 2", with "× n" only when the quantity is more than 1), the chosen
 * colours as small pills and the line price. Shared by Cart / Checkout / Order confirmation.
 *
 * `mode` adds the controls used on the checkout page:
 *   'view'   (default) - read only
 *   'bag'    - a quantity stepper and a small "Remove" link on each item (the bag's items)
 *   'buynow' - a quantity stepper and a "Change" link back to the product (the single Buy Now item)
 */
export function SummaryItems({ items, catalog, mode = 'view', onQuantityChange, onRemove, changeHref }) {
  return (
    <div className="summary-items">
      {items.map((item, index) => {
        const image = itemImage(item, catalog);
        return (
          <div key={item.cartItemId ?? index} className="summary-item">
            <span className="summary-item-image">
              {image && <img src={image} alt={`${item.productName} in ${item.selectedColorDetails?.[0]?.colorName || 'your chosen colour'}`} loading="lazy" />}
            </span>
            <span className="summary-item-info">
              <span className="summary-item-name">{item.productName}</span>
              <span className="summary-item-pack">
                {item.sellingOptionName}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </span>
              <ColorChips item={item} catalog={catalog} compact />
              {mode !== 'view' && (
                <span className="summary-item-edit">
                  <QuantitySelector value={item.quantity} onChange={(n) => onQuantityChange?.(item, n)} label={`quantity of ${item.productName}`} />
                  {mode === 'bag' && (
                    <button type="button" className="summary-item-link" onClick={() => onRemove?.(item)}>
                      Remove
                    </button>
                  )}
                  {mode === 'buynow' && changeHref && (
                    <Link to={changeHref} className="summary-item-link">
                      Change
                    </Link>
                  )}
                </span>
              )}
            </span>
            <span className="summary-item-price">₹{item.subtotal.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
