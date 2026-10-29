import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { UploadZone } from '../../components/UploadZone';
import { PhotoGrid } from '../../components/PhotoGrid';
import { ColorField } from '../../components/ColorField';
import { SellingOptionCard } from '../../components/SellingOptionCard';
import { Modal } from '../../components/Modal';
import { checkSellingOption } from '../../utils/sellingOptionChecks';
import { TestimonialVideosEditor, MAX_TESTIMONIAL_VIDEOS } from '../../components/TestimonialVideosEditor';
import { Loader } from '../../components/Loader';
import { minLength, slug as validateSlug, positiveNumber, runValidators, hasErrors } from '../../utils/validators';
import { mapServerFieldErrors } from '../../utils/formErrors';
import './Admin.css';

const EMPTY_PRODUCT = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  howToWear: '',
  basePrice: 0,
  images: [],
  commonImages: [],
  videoUrl: '',
  testimonialVideos: [],
  rating: 0,
  reviewCount: 0,
  variants: [],
  sellingOptions: [],
  isActive: true,
  isFeatured: false,
};

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let localIdCounter = 0;
function localId(prefix) {
  localIdCounter += 1;
  return `${prefix}_local_${localIdCounter}`;
}

export function AdminProductForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  // What the form looked like when it was loaded/saved - "Unsaved changes" is a
  // comparison against it.
  const [snapshot, setSnapshot] = useState(JSON.stringify(EMPTY_PRODUCT));
  const dirty = useMemo(() => JSON.stringify(form) !== snapshot, [form, snapshot]);
  // Removing a colour that has photos asks what to do with them.
  const [removingVariant, setRemovingVariant] = useState(null);

  // The browser's own "leave site?" prompt when the tab is closed/reloaded with edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function validate(values) {
    const errors = runValidators({
      name: () => minLength(values.name, 2, 'Name'),
      slug: () => validateSlug(values.slug),
      shortDescription: () => minLength(values.shortDescription, 1, 'Short description'),
      description: () => minLength(values.description, 1, 'Description'),
      basePrice: () => positiveNumber(values.basePrice, 'Base price'),
    });
    if (values.variants.length === 0) errors.variants = 'Add at least one color variant.';
    if (values.sellingOptions.length === 0) {
      errors.sellingOptions = 'Add at least one selling option.';
    } else {
      const optionErrors = values.sellingOptions.map((o) => checkSellingOption(o).errors[0] || '');
      if (optionErrors.some(Boolean)) errors.sellingOptionRows = optionErrors;
    }
    return errors;
  }

  useEffect(() => {
    if (isNew) return;
    productService
      .getById(id)
      .then(({ product }) => {
        const loaded = { ...EMPTY_PRODUCT, ...product };
        setForm(loaded);
        setSnapshot(JSON.stringify(loaded));
        setSlugTouched(true);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function handleNameChange(value) {
    setField('name', value);
    if (!slugTouched) setField('slug', slugify(value));
  }

  // Variants
  function addVariant() {
    setForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        { id: localId('var'), name: '', colorName: '', colorCode: '#000000', image: '', images: [], isActive: true, inStock: true },
      ],
    }));
    if (fieldErrors.variants) setFieldErrors((prev) => ({ ...prev, variants: '' }));
  }
  function updateVariant(index, patch) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }
  // A colour's photo list changed: keep `image` (the primary's URL) in step with it.
  function setVariantPhotos(index, photos) {
    updateVariant(index, { images: photos, image: photos.find((p) => p.isPrimary)?.url || '' });
  }
  function addVariantPhotos(index, url) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => {
        if (i !== index) return v;
        const list = v.images || [];
        if (list.some((p) => p.url === url) || list.length >= 10) return v;
        const images = [...list, { url, alt: '', isPrimary: list.length === 0 }];
        return { ...v, images, image: images.find((p) => p.isPrimary)?.url || '' };
      }),
    }));
  }
  // "Move to colour…" on a common photo.
  function moveCommonToColour(photoIndex, variantId) {
    setForm((prev) => {
      const photo = prev.commonImages[photoIndex];
      const target = prev.variants.find((v) => v.id === variantId);
      if (!photo || !target) return prev;
      if ((target.images || []).length >= 10) {
        showToast(`${target.colorName || 'That colour'} already has 10 photos.`, 'warning');
        return prev;
      }
      return {
        ...prev,
        commonImages: prev.commonImages.filter((_, i) => i !== photoIndex),
        variants: prev.variants.map((v) => {
          if (v.id !== variantId) return v;
          const images = [...(v.images || []), { ...photo, isPrimary: (v.images || []).length === 0 }];
          return { ...v, images, image: images.find((p) => p.isPrimary)?.url || '' };
        }),
      };
    });
    showToast('Photo moved — save the product to apply.', 'success');
  }
  function addCommonPhoto(url) {
    setForm((prev) => (prev.commonImages.some((p) => p.url === url) || prev.commonImages.length >= 30 ? prev : { ...prev, commonImages: [...prev.commonImages, { url, alt: '', isPrimary: false }] }));
  }
  // Remove a colour: with photos it asks whether they go too or become common photos.
  function requestRemoveVariant(index) {
    const v = form.variants[index];
    if ((v.images || []).length > 0) setRemovingVariant(index);
    else confirmRemoveVariant(index, 'none');
  }
  async function confirmRemoveVariant(index, photoChoice) {
    const v = form.variants[index];
    if (photoChoice === 'none') {
      const ok = await confirm({ title: `Remove ${v.colorName || 'this colour'}?`, message: 'The colour disappears from the product when you save.', confirmLabel: 'Remove', danger: true });
      if (!ok) return;
    }
    setForm((prev) => ({
      ...prev,
      commonImages: photoChoice === 'move' ? [...prev.commonImages, ...(v.images || []).map((p) => ({ ...p, isPrimary: false })).filter((p) => !prev.commonImages.some((c) => c.url === p.url))].slice(0, 30) : prev.commonImages,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
    setRemovingVariant(null);
    showToast(`Colour removed${photoChoice === 'move' ? ' — its photos are now common photos' : ''}. Save the product to apply.`, 'success');
  }

  // Selling options
  function addSellingOption() {
    setForm((prev) => ({
      ...prev,
      sellingOptions: [
        ...prev.sellingOptions,
        { id: localId('opt'), name: '', quantity: 1, price: 0, compareAtPrice: '', costPrice: '', isActive: true, allowDuplicateColors: false },
      ],
    }));
    if (fieldErrors.sellingOptions) setFieldErrors((prev) => ({ ...prev, sellingOptions: '' }));
  }
  function updateSellingOption(index, patch) {
    setForm((prev) => ({
      ...prev,
      sellingOptions: prev.sellingOptions.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
    if (fieldErrors.sellingOptionRows?.[index]) {
      setFieldErrors((prev) => ({
        ...prev,
        sellingOptionRows: prev.sellingOptionRows.map((e, i) => (i === index ? '' : e)),
      }));
    }
  }
  async function removeSellingOption(index) {
    const o = form.sellingOptions[index];
    const ok = await confirm({ title: `Remove ${o.name || `option ${index + 1}`}?`, message: 'Customers can no longer buy this pack once you save. Existing orders are not affected.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setForm((prev) => ({ ...prev, sellingOptions: prev.sellingOptions.filter((_, i) => i !== index) }));
    showToast('Option removed — save the product to apply.', 'success');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ name: true, slug: true, shortDescription: true, description: true, basePrice: true });
    if (hasErrors(errors)) return;
    setSaving(true);

    // Prices that look wrong (the amber warnings on the cards) are confirmed ONCE here; the
    // server's own guardrail is then told they were confirmed.
    const warnings = form.sellingOptions.flatMap((o) => checkSellingOption(o).warnings.map((w) => `${o.name || 'An option'}: ${w}`));
    let confirmedPrices = false;
    if (warnings.length > 0) {
      const yes = await confirm({ title: 'Are you sure about these prices?', message: warnings.join(' '), confirmLabel: 'Yes, save these prices', danger: true });
      if (!yes) {
        setSaving(false);
        return;
      }
      confirmedPrices = true;
    }

    const payload = {
      ...form,
      ...(confirmedPrices ? { confirmPriceWarnings: true } : {}),
      // Photos: common ones, and each colour's own (primary flag + alt text) - the server validates and derives the rest.
      images: form.commonImages.map((p) => p.url),
      commonImages: form.commonImages.map((p) => ({ url: p.url, alt: p.alt || '' })),
      basePrice: Number(form.basePrice),
      // New videos carry a temporary client id; the server assigns the real one.
      testimonialVideos: (form.testimonialVideos || []).slice(0, MAX_TESTIMONIAL_VIDEOS).map((v) => ({
        ...v,
        id: !v.id || v.id.includes('_local_') ? undefined : v.id,
      })),
      variants: form.variants.map((v) => ({
        ...v,
        id: v.id.includes('_local_') ? undefined : v.id,
        image: v.image || '',
        images: (v.images || []).map((p) => ({ url: p.url, alt: p.alt || '', isPrimary: Boolean(p.isPrimary) })),
      })),
      sellingOptions: form.sellingOptions.map((o) => ({
        ...o,
        id: o.id.includes('_local_') ? undefined : o.id,
        quantity: Number(o.quantity),
        price: Number(o.price),
        // Equal/blank/zero means "no discount" — omit so the frontend's
        // `compareAtPrice > price` sale check naturally stays off, rather
        // than persisting a value that doesn't represent a real discount.
        compareAtPrice:
          o.compareAtPrice !== '' && o.compareAtPrice !== null && Number(o.compareAtPrice) > Number(o.price)
            ? Number(o.compareAtPrice)
            : undefined,
        // Internal cost of this pack (admin-only, powers Financial
        // Analytics). Blank clears it to "unknown".
        costPrice: o.costPrice !== '' && o.costPrice != null && Number(o.costPrice) >= 0 ? Number(o.costPrice) : null,
      })),
    };

    // The server refuses prices below the minimum / too far under the MRP until
    // they are confirmed. Ask once, then send the same request again, confirmed.
    async function save(extra = {}) {
      try {
        if (isNew) await productService.create({ ...payload, ...extra });
        else await productService.update(id, { ...payload, ...extra });
      } catch (err) {
        if (err.code !== 'PRICE_CONFIRMATION_REQUIRED') throw err;
        const warnings = err.details?.warnings || [];
        const yes = await confirm({
          title: `Are you sure? Price is ₹${warnings[0]?.price ?? ''}`,
          message: `${warnings.map((w) => w.message).join(' ')} Save anyway?`,
          confirmLabel: 'Yes, save these prices',
          danger: true,
        });
        if (!yes) return false;
        await save({ confirmPriceWarnings: true });
      }
      return true;
    }

    try {
      const saved = await save();
      if (!saved) return; // the admin chose to fix the price
      showToast(isNew ? 'Product created' : 'Product updated', 'success');
      setSnapshot(JSON.stringify(form)); // saved: nothing unsaved any more
      navigate('/admin/products');
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader label="Loading product…" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>{isNew ? 'Add Product' : 'Edit Product'}</h1>
      </div>

      <form className="admin-form" onSubmit={handleSubmit} noValidate>
        <div className="admin-form-section">
          <h3>Basics</h3>
          <div className={`field ${touched.name && fieldErrors.name ? 'invalid' : ''}`}>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => markTouched('name')}
            />
            {touched.name && fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>
          <div className={`field ${touched.slug && fieldErrors.slug ? 'invalid' : ''}`}>
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setField('slug', e.target.value);
              }}
              onBlur={() => markTouched('slug')}
            />
            {touched.slug && fieldErrors.slug && <p className="field-error">{fieldErrors.slug}</p>}
          </div>
          <div className={`field ${touched.shortDescription && fieldErrors.shortDescription ? 'invalid' : ''}`}>
            <label htmlFor="shortDescription">Short Description</label>
            <input
              id="shortDescription"
              required
              value={form.shortDescription}
              onChange={(e) => setField('shortDescription', e.target.value)}
              onBlur={() => markTouched('shortDescription')}
            />
            {touched.shortDescription && fieldErrors.shortDescription && (
              <p className="field-error">{fieldErrors.shortDescription}</p>
            )}
          </div>
          <div className={`field ${touched.description && fieldErrors.description ? 'invalid' : ''}`}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={4}
              required
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              onBlur={() => markTouched('description')}
            />
            {touched.description && fieldErrors.description && <p className="field-error">{fieldErrors.description}</p>}
          </div>
          <div className="field">
            <label htmlFor="howToWear">How to Wear / Fit Notes (optional)</label>
            <textarea
              id="howToWear"
              rows={3}
              value={form.howToWear || ''}
              onChange={(e) => setField('howToWear', e.target.value)}
              placeholder="Shown as an extra accordion section on the product page. Leave blank to hide it."
            />
          </div>
          <div className="admin-form-row">
            <div className={`field ${touched.basePrice && fieldErrors.basePrice ? 'invalid' : ''}`}>
              <label htmlFor="basePrice">Base Price (₹)</label>
              <input
                id="basePrice"
                type="number"
                min="0"
                required
                value={form.basePrice}
                onChange={(e) => setField('basePrice', e.target.value)}
                onBlur={() => markTouched('basePrice')}
              />
              {touched.basePrice && fieldErrors.basePrice && <p className="field-error">{fieldErrors.basePrice}</p>}
            </div>
            <div className="field">
              <label>Rating</label>
              <p className="field-hint" style={{ marginTop: 10 }}>
                {form.reviewCount > 0
                  ? `${form.rating.toFixed(1)} ★ from ${form.reviewCount} review${form.reviewCount === 1 ? '' : 's'}`
                  : 'No reviews yet'}
                {' — '}computed automatically, see{' '}
                <a href="/admin/reviews">Reviews</a>.
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="videoUrl">Product Video (optional, one MP4)</label>
            {form.videoUrl ? (
              <div className="repeatable-row">
                <video src={form.videoUrl} muted style={{ width: 80, height: 80, objectFit: 'contain', background: 'var(--color-footer-bg)' }} />
                <span style={{ flex: 2, fontSize: '0.8rem', wordBreak: 'break-all' }}>{form.videoUrl}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setField('videoUrl', '')}>
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            ) : (
              <UploadZone
                folder="videos"
                types={['video/mp4']}
                maxMb={60}
                multiple={false}
                maxFiles={1}
                label="Drop an MP4 here or click to upload"
                hint="MP4 · up to 60 MB"
                onUploaded={(url) => setField('videoUrl', url)}
              />
            )}
          </div>
          <div className="checkbox-field">
            <input
              id="isActive"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            <label htmlFor="isActive">Active (visible to customers)</label>
          </div>
          <div className="checkbox-field">
            <input
              id="isFeatured"
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => setField('isFeatured', e.target.checked)}
            />
            <label htmlFor="isFeatured">Featured on homepage</label>
          </div>
        </div>

        <div className="admin-form-section">
          <h3>Common Images</h3>
          <p className="field-hint">Shown for every colour, after the colour&apos;s own photos.</p>
          <UploadZone folder="products" maxFiles={30 - form.commonImages.length} onUploaded={addCommonPhoto} />
          <PhotoGrid
            photos={form.commonImages}
            onChange={(next) => setField('commonImages', next)}
            moveTargets={form.variants.map((v, i) => ({ id: v.id, label: v.colorName || `Colour ${i + 1}` }))}
            onMoveToColour={moveCommonToColour}
          />
          {form.commonImages.length === 0 && <p className="field-hint">No common photos yet.</p>}
        </div>

        <div className="admin-form-section">
          <h3>Customer Videos</h3>
          <TestimonialVideosEditor
            videos={form.testimonialVideos || []}
            onChange={(next) => setField('testimonialVideos', next)}
          />
        </div>

        <div className="admin-form-section">
          <h3>Color Variants</h3>
          {form.variants.map((v, i) => {
            const photos = v.images || [];
            const noPhotos = v.isActive && photos.length === 0;
            return (
              <div key={v.id} className="variant-card">
                <div className="variant-row">
                  <span className="variant-thumb" aria-hidden="true">
                    {v.image ? <img src={v.image} alt="" /> : <span style={{ background: v.colorCode }} />}
                  </span>
                  <div className="field variant-name">
                    <label htmlFor={`vn-${v.id}`}>Colour name</label>
                    <input id={`vn-${v.id}`} required value={v.colorName} onChange={(e) => updateVariant(i, { colorName: e.target.value, name: `${form.name} - ${e.target.value}` })} />
                  </div>
                  <div className="field variant-code">
                    <label htmlFor={`vc-${v.id}`}>Colour code</label>
                    <ColorField id={`vc-${v.id}`} value={v.colorCode} onChange={(code) => updateVariant(i, { colorCode: code })} />
                  </div>
                  <label className="variant-check">
                    <input type="checkbox" checked={v.isActive} onChange={(e) => updateVariant(i, { isActive: e.target.checked })} /> Active
                  </label>
                  <label className="variant-check">
                    <input type="checkbox" checked={v.inStock !== false} onChange={(e) => updateVariant(i, { inStock: e.target.checked })} /> In stock
                  </label>
                  <button type="button" className="so-remove" onClick={() => requestRemoveVariant(i)}>
                    <Trash2 size={14} aria-hidden="true" /> Remove
                  </button>
                </div>
                {noPhotos && (
                  <p className="variant-warning"><AlertTriangle size={14} aria-hidden="true" /> No photos — this colour will show only the common images.</p>
                )}
                <UploadZone
                  folder="variants"
                  maxFiles={10 - photos.length}
                  onUploaded={(url) => addVariantPhotos(i, url)}
                  label={`Drop ${v.colorName || 'this colour'} photos here or click to upload`}
                  hint={`JPG, PNG or WebP · up to 5 MB each · ${photos.length}/10 · ★ marks the primary photo`}
                />
                <PhotoGrid photos={photos} primary label={`${v.colorName || 'colour'} photo`} onChange={(next) => setVariantPhotos(i, next)} />
              </div>
            );
          })}
          <button type="button" className="btn btn-outline btn-sm" onClick={addVariant}>
            <Plus size={16} /> Add Color
          </button>
          {fieldErrors.variants && <p className="field-error" style={{ marginTop: 8 }}>{fieldErrors.variants}</p>}
        </div>

        <div className="admin-form-section">
          <h3>Selling Options</h3>
          {form.sellingOptions.map((o, i) => (
            <SellingOptionCard
              key={o.id}
              option={o}
              index={i}
              onChange={(patch) => updateSellingOption(i, patch)}
              onRemove={() => removeSellingOption(i)}
            />
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={addSellingOption}>
            <Plus size={16} /> Add selling option
          </button>
          {fieldErrors.sellingOptions && <p className="field-error" style={{ marginTop: 8 }}>{fieldErrors.sellingOptions}</p>}
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="admin-form-sticky-actions">
          {dirty && <span className="unsaved-dot" role="status"><span aria-hidden="true" /> Unsaved changes</span>}
          <button
            type="button"
            className="btn btn-outline"
            onClick={async () => {
              if (dirty) {
                const leave = await confirm({ title: 'Leave without saving?', message: 'Your changes to this product will be lost.', confirmLabel: 'Leave', danger: true });
                if (!leave) return;
              }
              navigate('/admin/products');
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
          </button>
        </div>
      </form>
      <Modal
        open={removingVariant !== null}
        onClose={() => setRemovingVariant(null)}
        title={`Remove ${form.variants[removingVariant]?.colorName || 'this colour'}?`}
      >
        <p>
          This colour has {(form.variants[removingVariant]?.images || []).length} photo(s). What should happen to them?
        </p>
        <div className="remove-variant-actions">
          <button type="button" className="btn btn-outline" onClick={() => confirmRemoveVariant(removingVariant, 'move')}>
            Keep them as common images
          </button>
          <button type="button" className="btn btn-danger" onClick={() => confirmRemoveVariant(removingVariant, 'delete')}>
            Delete the photos too
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRemovingVariant(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
