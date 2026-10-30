import { Trash2 } from 'lucide-react';
import { checkSellingOption } from '../utils/sellingOptionChecks';
import './SellingOptionCard.css';

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function Money({ id, value, onChange, invalid, placeholder }) {
  return (
    <div className={`so-money ${invalid ? 'invalid' : ''}`}>
      <span aria-hidden="true">₹</span>
      <input id={id} type="number" min="0" step="any" inputMode="decimal" value={value ?? ''} onChange={onChange} placeholder={placeholder} aria-invalid={invalid || undefined} />
    </div>
  );
}

/**
 * One selling option as its own card: a header (title, Active, Remove), then a
 * single row of five equal columns - Name, Colours required, Selling price, MRP,
 * Cost price - each with its helper text in a fixed-height row UNDER the input,
 * so nothing shifts when a message appears.
 */
export function SellingOptionCard({ option, index, onChange, onRemove }) {
  const { errors, warnings, discountPct, profit } = checkSellingOption(option);
  const key = `so-${option.id}`;
  const price = Number(option.price);
  const mrp = Number(option.compareAtPrice);
  const qty = Number(option.quantity);
  const free = Number(option.freeQuantity);
  const freeLabel = Number.isInteger(qty) && Number.isInteger(free) && free > 0 && free < qty ? `Buy ${qty - free}, get ${free} free` : '';

  return (
    <section className="so-card" aria-label={`Selling option ${index + 1}`}>
      <header className="so-head">
        <h4>
          Option {index + 1}
          {option.name ? <> · {option.name}</> : null}
        </h4>
        <div className="so-head-actions">
          <label className="so-toggle">
            <input type="checkbox" checked={option.isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
            Active
          </label>
          <button type="button" className="so-remove" onClick={onRemove}>
            <Trash2 size={14} aria-hidden="true" /> Remove
          </button>
        </div>
      </header>

      <div className="so-grid">
        <div className="so-field">
          <label htmlFor={`${key}-name`}>Name <b aria-hidden="true">*</b></label>
          <input id={`${key}-name`} className="so-input" required value={option.name} onChange={(e) => onChange({ name: e.target.value })} />
          <p className="so-help" />
        </div>
        <div className="so-field">
          <label htmlFor={`${key}-qty`}>Colours required <b aria-hidden="true">*</b></label>
          <input id={`${key}-qty`} className="so-input" type="number" min="1" step="1" required value={option.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
          <p className="so-help">How many colours the customer picks.</p>
        </div>
        <div className="so-field">
          <label htmlFor={`${key}-price`}>Selling price <b aria-hidden="true">*</b></label>
          <Money id={`${key}-price`} value={option.price} onChange={(e) => onChange({ price: e.target.value })} invalid={errors.some((e) => /Selling price/.test(e))} />
          <p className="so-help" />
        </div>
        <div className="so-field">
          <label htmlFor={`${key}-mrp`}>MRP <span className="so-optional">Optional</span></label>
          <Money id={`${key}-mrp`} value={option.compareAtPrice} onChange={(e) => onChange({ compareAtPrice: e.target.value })} placeholder="No discount" />
          <p className="so-help">
            {discountPct > 0 ? `${discountPct}% off – customers see ${rupees(price)} struck through ${rupees(mrp)}` : ''}
          </p>
        </div>
        <div className="so-field">
          <label htmlFor={`${key}-cost`}>Cost price <span className="so-optional">Optional</span></label>
          <Money id={`${key}-cost`} value={option.costPrice} onChange={(e) => onChange({ costPrice: e.target.value })} placeholder="Admin only" />
          <p className="so-help">
            Never shown to customers. Used for profit in Analytics.
            {profit !== null && <strong className={profit < 0 ? 'neg' : 'pos'}> Profit: {rupees(profit)} per pack</strong>}
          </p>
        </div>
      </div>

      <footer className="so-foot">
        <div className="so-free">
          <label htmlFor={`${key}-badge`}>Badge on this pack</label>
          <input
            id={`${key}-badge`}
            className="so-input"
            list={`${key}-badge-ideas`}
            maxLength={20}
            placeholder="e.g. Best Value"
            value={option.badgeLabel ?? ''}
            onChange={(e) => onChange({ badgeLabel: e.target.value })}
          />
          <datalist id={`${key}-badge-ideas`}>
            <option value="Best Value" />
            <option value="Most Popular" />
            <option value="Limited Offer" />
          </datalist>
          <p className="so-help">The small tag on top of this pack's card. Leave blank for none. Use it on one pack to steer shoppers to it.</p>
        </div>
        <div className="so-free">
          <label htmlFor={`${key}-free`}>Free pieces in this pack</label>
          <input
            id={`${key}-free`}
            className="so-input"
            type="number"
            min="0"
            step="1"
            value={option.freeQuantity ?? 0}
            onChange={(e) => onChange({ freeQuantity: e.target.value })}
          />
          <p className="so-help">
            {freeLabel
              ? `Customers see "${freeLabel}" - they get ${option.quantity} pieces and pay the price above.`
              : 'For offers like "buy 3, get 1 free": set Colours required to 4 and this to 1. The price stays the pack price.'}
          </p>
        </div>
        <label className="so-toggle">
          <input type="checkbox" checked={option.allowDuplicateColors} onChange={(e) => onChange({ allowDuplicateColors: e.target.checked })} />
          Allow duplicate colours
        </label>
      </footer>

      {errors.length > 0 && <ul className="so-messages errors" role="alert">{errors.map((m) => <li key={m}>{m}</li>)}</ul>}
      {warnings.length > 0 && <ul className="so-messages warnings">{warnings.map((m) => <li key={m}>{m}</li>)}</ul>}
    </section>
  );
}
