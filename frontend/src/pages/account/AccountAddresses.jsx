import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { addressService } from '../../services/addressService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { AddressCard } from '../../components/AddressCard';
import { AddressFormFields, ADDRESS_FORM_EMPTY, addressFormToPayload, addressToForm, validateAddressForm } from '../../components/AddressFormFields';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Loader } from '../../components/Loader';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { required, minLength, phone as validatePhone, pincode as validatePincode, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import './Account.css';

export function AccountAddresses() {
  useDocumentMeta({ title: 'Addresses', path: '/account/addresses', noindex: true });

  const { showToast } = useToast();
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(ADDRESS_FORM_EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [pincodeLookupState, setPincodeLookupState] = useState('idle');

  function load() {
    addressService.list().then((data) => setAddresses(data.addresses));
  }

  useEffect(load, []);

  function openNew() {
    setEditingId(null);
    setForm(ADDRESS_FORM_EMPTY);
    setFieldErrors({});
    setTouched({});
    setModalOpen(true);
  }

  function openEdit(addr) {
    setEditingId(addr.addressId);
    setForm(addressToForm(addr));
    setFieldErrors({});
    setTouched({});
    setModalOpen(true);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  // Same pincode -> city/state autofill pattern used at Checkout — both
  // fields stay editable, this only ever pre-fills, never locks anything.
  useEffect(() => {
    const pin = form.pincode.trim();
    if (!/^\d{6}$/.test(pin)) {
      setPincodeLookupState('idle');
      return;
    }
    let cancelled = false;
    setPincodeLookupState('loading');
    const timer = setTimeout(() => {
      fetch(`https://api.postalpincode.in/pincode/${pin}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          const office = data?.[0]?.PostOffice?.[0];
          if (data?.[0]?.Status === 'Success' && office) {
            setForm((prev) => ({ ...prev, city: office.District, state: office.State }));
            setPincodeLookupState('success');
          } else {
            setPincodeLookupState('not-found');
          }
        })
        .catch(() => !cancelled && setPincodeLookupState('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pincode]);

  async function handleSave(e) {
    e.preventDefault();
    const errors = validateAddressForm(form, { required, minLength, phone: validatePhone, pincode: validatePincode });
    setFieldErrors(errors);
    setTouched({
      fullName: true,
      phone: true,
      houseFlat: true,
      areaStreet: true,
      city: true,
      state: true,
      pincode: true,
      country: true,
    });
    if (hasErrors(errors)) return;

    const payload = addressFormToPayload(form);

    setSaving(true);
    try {
      if (editingId) {
        await addressService.update(editingId, payload);
      } else {
        await addressService.create(payload);
      }
      setModalOpen(false);
      load();
      showToast('Address saved', 'success');
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else showToast(err.message, 'error');
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
        <form onSubmit={handleSave} noValidate>
          <AddressFormFields
            form={form}
            setField={setField}
            touched={touched}
            markTouched={markTouched}
            fieldErrors={fieldErrors}
            pincodeLookupState={pincodeLookupState}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={saving} style={{ marginTop: 16 }}>
            {saving ? 'Saving…' : 'Save Address'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
