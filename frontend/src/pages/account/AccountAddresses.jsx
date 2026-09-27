import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { addressService } from '../../services/addressService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { AddressCard } from '../../components/AddressCard';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Loader } from '../../components/Loader';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import './Account.css';

const EMPTY_FORM = { label: 'Home', fullName: '', phone: '', line1: '', city: '', state: '', pincode: '', country: 'India' };

export function AccountAddresses() {
  useDocumentMeta({ title: 'Addresses', path: '/account/addresses' });

  const { showToast } = useToast();
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    addressService.list().then((data) => setAddresses(data.addresses));
  }

  useEffect(load, []);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(addr) {
    setEditingId(addr.addressId);
    setForm({ ...addr });
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await addressService.update(editingId, form);
      } else {
        await addressService.create(form);
      }
      setModalOpen(false);
      load();
      showToast('Address saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Delete this address?',
      message: 'This address will be permanently removed from your account.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await addressService.remove(id);
      load();
      showToast('Address deleted', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleSetDefault(addr) {
    try {
      await addressService.update(addr.addressId, { isDefault: true });
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!addresses) return <Loader label="Loading addresses…" />;

  return (
    <div>
      <div className="account-page-header-row" style={{ marginBottom: 24 }}>
        <h1 className="text-headline-lg">Addresses</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
          <Plus size={16} /> Add New Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState title="No saved addresses" message="Add an address to speed up checkout next time." />
      ) : (
        <div className="address-grid">
          {addresses.map((addr) => (
            <AddressCard
              key={addr.addressId}
              address={addr}
              onEdit={() => openEdit(addr)}
              onDelete={() => handleDelete(addr.addressId)}
              onSetDefault={() => handleSetDefault(addr)}
            />
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Address' : 'Add Address'}>
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Label</label>
            <input value={form.label} onChange={(e) => setField('label', e.target.value)} />
          </div>
          <div className="field">
            <label>Full Name</label>
            <input required value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input required value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <input required value={form.line1} onChange={(e) => setField('line1', e.target.value)} />
          </div>
          <div className="field">
            <label>City</label>
            <input required value={form.city} onChange={(e) => setField('city', e.target.value)} />
          </div>
          <div className="field">
            <label>State</label>
            <input required value={form.state} onChange={(e) => setField('state', e.target.value)} />
          </div>
          <div className="field">
            <label>Pincode</label>
            <input required value={form.pincode} onChange={(e) => setField('pincode', e.target.value)} />
          </div>
          <div className="field">
            <label>Country</label>
            <input required value={form.country} onChange={(e) => setField('country', e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save Address'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
