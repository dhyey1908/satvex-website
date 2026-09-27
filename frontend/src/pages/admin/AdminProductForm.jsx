import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { ImageUploader } from '../../components/ImageUploader';
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
  videoUrl: '',
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

  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

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
      const optionErrors = values.sellingOptions.map((o) => {
        const priceError = positiveNumber(o.price, 'Price');
        if (priceError) return priceError;
        if (o.compareAtPrice !== '' && o.compareAtPrice !== null && o.compareAtPrice !== undefined) {
          const mrpError = positiveNumber(o.compareAtPrice, 'Original price');
          if (mrpError) return mrpError;
          if (Number(o.price) > Number(o.compareAtPrice)) {
            return 'Selling price cannot be greater than the original price.';
          }
        }
        return '';
      });
      if (optionErrors.some(Boolean)) errors.sellingOptionRows = optionErrors;
    }
    return errors;
  }

  useEffect(() => {
    if (isNew) return;
    productService
      .getById(id)
      .then(({ product }) => {
        setForm(product);
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
        { id: localId('var'), name: '', colorName: '', colorCode: '#000000', image: '', isActive: true },
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
  function removeVariant(index) {
    setForm((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
  }

  // Selling options
  function addSellingOption() {
    setForm((prev) => ({
      ...prev,
      sellingOptions: [
        ...prev.sellingOptions,
        { id: localId('opt'), name: '', quantity: 1, price: 0, compareAtPrice: '', isActive: true, allowDuplicateColors: false },
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
  function removeSellingOption(index) {
    setForm((prev) => ({ ...prev, sellingOptions: prev.sellingOptions.filter((_, i) => i !== index) }));
  }

  // Product images
  function addProductImage(url) {
    setForm((prev) => ({ ...prev, images: [...prev.images, url] }));
  }
  function removeProductImage(index) {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ name: true, slug: true, shortDescription: true, description: true, basePrice: true });
    if (hasErrors(errors)) return;
    setSaving(true);

    const payload = {
      ...form,
      basePrice: Number(form.basePrice),
      variants: form.variants.map((v) => ({ ...v, id: v.id.includes('_local_') ? undefined : v.id })),
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
      })),
    };

    try {
      if (isNew) {
        await productService.create(payload);
        showToast('Product created', 'success');
      } else {
        await productService.update(id, payload);
        showToast('Product updated', 'success');
      }
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
            <label htmlFor="videoUrl">Video URL</label>
            <input id="videoUrl" value={form.videoUrl} onChange={(e) => setField('videoUrl', e.target.value)} />
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
          <h3>Images</h3>
          {form.images.map((img, i) => (
            <div key={img + i} className="repeatable-row">
              <img src={img} alt="" />
              <span style={{ flex: 2, fontSize: '0.8rem', wordBreak: 'break-all' }}>{img}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeProductImage(i)}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          ))}
          <ImageUploader folder="products" onUploaded={addProductImage} />
        </div>

        <div className="admin-form-section">
          <h3>Color Variants</h3>
          {form.variants.map((v, i) => (
            <div key={v.id} className="repeatable-row">
              {v.image && <img src={v.image} alt="" />}
              <div className="field">
                <label>Color Name</label>
                <input required value={v.colorName} onChange={(e) => updateVariant(i, { colorName: e.target.value, name: `${form.name} - ${e.target.value}` })} />
              </div>
              <div className="field">
                <label>Color Code</label>
                <input type="color" value={v.colorCode} onChange={(e) => updateVariant(i, { colorCode: e.target.value })} />
              </div>
              <ImageUploader folder="variants" onUploaded={(url) => updateVariant(i, { image: url })} />
              <label className="checkbox-field">
                <input type="checkbox" checked={v.isActive} onChange={(e) => updateVariant(i, { isActive: e.target.checked })} />
                Active
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeVariant(i)}>
                <Trash2 size={14} /> Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={addVariant}>
            <Plus size={16} /> Add Color
          </button>
          {fieldErrors.variants && <p className="field-error" style={{ marginTop: 8 }}>{fieldErrors.variants}</p>}
        </div>

        <div className="admin-form-section">
          <h3>Selling Options</h3>
          {form.sellingOptions.map((o, i) => (
            <div key={o.id} className="repeatable-row">
              <div className="field">
                <label>Name</label>
                <input required value={o.name} onChange={(e) => updateSellingOption(i, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>Quantity (colors required)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={o.quantity}
                  onChange={(e) => updateSellingOption(i, { quantity: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Selling Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={o.price}
                  onChange={(e) => updateSellingOption(i, { price: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Original Price / MRP (₹, optional)</label>
                <input
                  type="number"
                  min="0"
                  value={o.compareAtPrice ?? ''}
                  onChange={(e) => updateSellingOption(i, { compareAtPrice: e.target.value })}
                  placeholder="Leave blank for no discount"
                />
              </div>
              {(() => {
                const mrp = Number(o.compareAtPrice);
                const price = Number(o.price);
                const showDiscount = o.compareAtPrice !== '' && mrp > price && price >= 0;
                const pct = showDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
                return showDiscount ? (
                  <p className="field-hint admin-discount-preview">{pct}% off — customers will see ₹{price} struck through from ₹{mrp}</p>
                ) : null;
              })()}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={o.allowDuplicateColors}
                  onChange={(e) => updateSellingOption(i, { allowDuplicateColors: e.target.checked })}
                />
                Allow duplicate colors
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={o.isActive} onChange={(e) => updateSellingOption(i, { isActive: e.target.checked })} />
                Active
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeSellingOption(i)}>
                <Trash2 size={14} /> Remove
              </button>
              {fieldErrors.sellingOptionRows?.[i] && (
                <p className="field-error" style={{ width: '100%', marginTop: 4 }}>{fieldErrors.sellingOptionRows[i]}</p>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={addSellingOption}>
            <Plus size={16} /> Add Selling Option
          </button>
          {fieldErrors.sellingOptions && <p className="field-error" style={{ marginTop: 8 }}>{fieldErrors.sellingOptions}</p>}
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
