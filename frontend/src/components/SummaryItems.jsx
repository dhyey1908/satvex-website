import { ColorChips } from './ColorChips';
import { itemImage } from '../utils/itemImage';

/**
 * The items listed inside an order summary: photo of the CHOSEN colour (first
 * selected colour for a combo), name, "Combo of 2 × 1", colour chips and the
 * line price. Shared by Cart/Checkout.
 */
export function SummaryItems({ items, catalog }) {
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
              <span className="summary-item-pack">{item.sellingOptionName} × {item.quantity}</span>
              <ColorChips item={item} catalog={catalog} />
            </span>
            <span className="summary-item-price">₹{item.subtotal.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
