import { Check, Pencil, Star, Trash2 } from 'lucide-react';
import './AddressCard.css';

export function AddressCard({ address, selected, onSelect, onEdit, onDelete, onSetDefault }) {
  return (
    <div className={`address-card ${selected ? 'selected' : ''}`}>
      {address.isDefault && <span className="address-default-badge">Default</span>}
      <p className="address-label">{address.label}</p>
      <p className="address-name">{address.fullName}</p>
      <p className="address-lines">
        {address.line1}
        <br />
        {address.city}, {address.state} {address.pincode}
        <br />
        {address.country}
      </p>
      <p className="address-phone">{address.phone}</p>

      <div className="address-card-actions">
        {onSelect && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onSelect} disabled={selected}>
            <Check size={14} /> {selected ? 'Selected' : 'Use this address'}
          </button>
        )}
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </button>
        )}
        {onSetDefault && !address.isDefault && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSetDefault}>
            <Star size={14} /> Set as default
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
