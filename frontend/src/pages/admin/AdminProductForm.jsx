import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productService } from '../../services/productService';
import { useToast } from '../../context/ToastContext';
import { ImageUploader } from '../../components/ImageUploader';
import { Loader } from '../../components/Loader';
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
        { id: localId('opt'), name: '', quantity: 1, price: 0, isActive: true, allowDuplicateColors: false },
      ],
    }));
  }
  function updateSellingOption(index, patch) {
    setForm((prev) => ({
      ...prev,
      sellingOptions: prev.sellingOptions.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
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
      setError(err.message);
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

      <form className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form-section">
          <h3>Basics</h3>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" required value={form.name} onChange={(e) => handleNameChange(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setField('slug', e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="shortDescription">Short Description</label>
            <input
              id="shortDescription"
              required
              value={form.shortDescription}
              onChange={(e) => setField('shortDescription', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={4}
              required
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
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
            <div className="field">
              <label htmlFor="basePrice">Base Price (₹)</label>
              <input
                id="basePrice"
                type="number"
                min="0"
                required
                value={form.basePrice}
                onChange={(e) => setField('basePrice', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Rating</label>
              <p className="field-hint" style={{ marginTop: 10 }}>
                {form.reviewCount > 0
                  ? `${form.rating.toFixed(1)} ★ from ${form.reviewCount} approved review${form.reviewCount === 1 ? '' : 's'}`
                  : 'No approved reviews yet'}
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
                Remove
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
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={addVariant}>
            + Add Color
          </button>
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
                <label>Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={o.price}
                  onChange={(e) => updateSellingOption(i, { price: e.target.value })}
                />
              </div>
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
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-outline btn-sm" onClick={addSellingOption}>
            + Add Selling Option
          </button>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
