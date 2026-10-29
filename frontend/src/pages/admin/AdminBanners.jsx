import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, GripVertical, ImageIcon, Replace, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { Modal } from '../../components/Modal';
import { UploadZone } from '../../components/UploadZone';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { Switch } from '../../components/admin/Switch';
import { RowMenu } from '../../components/admin/RowMenu';
import { LinkPicker } from '../../components/admin/LinkPicker';
import { DateRangePicker } from '../../components/admin/DateRangePicker';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { StickySaveBar } from '../../components/admin/StickySaveBar';
import { linkProblem } from '../../utils/linkTargets';
import { SCHEDULE_LABELS, scheduleState } from '../../utils/statusTones';
import { todayIST } from '../../utils/dateRange';
import './Admin.css';
import './AdminLists.css';

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
const IMAGE_ONLY = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BANNERS = 10;
const isVideoUrl = (url) => /\.mp4(\?|$)/i.test(url || '');

function BannerPreview({ open, onClose, banners }) {
  const [device, setDevice] = useState('desktop');
  const [index, setIndex] = useState(0);
  const today = todayIST();
  const live = banners.filter((b) => scheduleState(b, today) === 'live' && b.mediaUrl);
  const current = live[index % Math.max(live.length, 1)];
  const src = current && device === 'mobile' && current.mobileMediaUrl ? current.mobileMediaUrl : current?.mediaUrl;

  return (
    <Modal open={open} onClose={onClose} title="Homepage banner preview">
      <div className="an-preview-head">
        <div className="an-seg" role="group" aria-label="Device">
          {['desktop', 'mobile'].map((d) => (
            <button key={d} type="button" className={device === d ? 'is-on' : ''} aria-pressed={device === d} onClick={() => setDevice(d)}>
              {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
        {live.length > 1 && (
          <span className="ui-muted">
            Slide {(index % live.length) + 1} of {live.length}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIndex((i) => (i + 1) % live.length)}>Next</button>
          </span>
        )}
      </div>
      {!current ? (
        <p className="ui-muted">No live banners — the homepage shows its default hero image.</p>
      ) : (
        <div className={`an-frame ${device === 'mobile' ? 'is-mobile' : ''}`} style={{ aspectRatio: device === 'mobile' ? '4 / 5' : '12 / 5', background: 'var(--color-surface-alt)' }}>
          {current.type === 'video' ? (
            <video key={src} src={src} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <img src={src} alt={current.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
      )}
    </Modal>
  );
}

export function AdminBanners() {
  const { showToast } = useToast();
  const [banners, setBanners] = useState(null);
  const [saved, setSaved] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState(null);
  const [armed, setArmed] = useState(null); // the card whose drag handle is held
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    adminService.getSettings().then((data) => {
      const list = data.settings.heroBanners || [];
      setBanners(list);
      setSaved(JSON.stringify(list));
    });
    adminService.products({ pageSize: 100 }).then((d) => setProducts((d.products || []).map((p) => ({ slug: p.slug, name: p.name })))).catch(() => setProducts(null));
  }, []);

  const dirty = banners !== null && JSON.stringify(banners) !== saved;
  const today = todayIST();
  const liveCount = useMemo(() => (banners || []).filter((b) => scheduleState(b, today) === 'live').length, [banners, today]);

  const update = (id, patch) => setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  function move(from, to) {
    setBanners((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }

  function addMedia(url) {
    setBanners((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: isVideoUrl(url) ? 'video' : 'image', mediaUrl: url, mobileMediaUrl: '', title: '', alt: '', link: '', startDate: '', endDate: '', isActive: true },
    ]);
  }

  async function save() {
    const bad = banners.find((b) => linkProblem(b.link, products));
    if (bad) {
      showToast(`Fix the link on “${bad.title || 'a banner'}”: ${linkProblem(bad.link, products)}`, 'error');
      return;
    }
    setSaving(true);
    try {
      await adminService.updateSettings({ heroBanners: banners });
      setSaved(JSON.stringify(banners));
      showToast('Banners saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!banners) return <Loader label="Loading banners…" />;

  return (
    <div>
      <PageHeader
        title="Homepage banners"
        subtitle={`${countLabel(banners.length, 'banner')} · ${liveCount} live`}
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewing(true)}>
            <Eye size={14} /> Preview
          </button>
        }
      />
      <p className="ui-muted" style={{ marginTop: 0, maxWidth: '44rem' }}>
        The rotating hero on the homepage. Drag the handle (or use the arrows) to reorder. Nothing goes live until you save.
      </p>

      <div className="bn-list">
        {banners.length === 0 && <div className="ui-empty"><div className="ui-empty-icon"><ImageIcon size={26} /></div><h3>No banners yet</h3><p>The homepage shows its default hero image. Add one below.</p></div>}

        {banners.map((b, index) => {
          const state = scheduleState(b, today);
          const problem = linkProblem(b.link, products);
          return (
            <div
              key={b.id}
              className={`bn-card ${dragId === b.id ? 'is-dragging' : ''} ${overId === b.id && dragId !== b.id ? 'is-over' : ''}`}
              draggable={armed === b.id}
              onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(b.id); } }}
              onDrop={(e) => { e.preventDefault(); move(banners.findIndex((x) => x.id === dragId), index); setDragId(null); setOverId(null); setArmed(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); setArmed(null); }}
            >
              <div className="bn-handle">
                <button type="button" aria-label={`Move banner ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronUp size={16} /></button>
                <span role="img" aria-label="Drag to reorder" onPointerDown={() => setArmed(b.id)} onPointerUp={() => setArmed(null)} style={{ display: 'inline-flex', touchAction: 'none' }}>
                  <GripVertical size={18} />
                </span>
                <button type="button" aria-label={`Move banner ${index + 1} down`} disabled={index === banners.length - 1} onClick={() => move(index, index + 1)}><ChevronDown size={16} /></button>
              </div>

              <div>
                {replacing === b.id ? (
                  <UploadZone folder="banners" types={MEDIA_TYPES} maxMb={10} multiple={false} maxFiles={1} label="Drop the new image or MP4" hint="Replaces this banner's media" onUploaded={(url) => { update(b.id, { mediaUrl: url, type: isVideoUrl(url) ? 'video' : 'image' }); setReplacing(null); }} />
                ) : (
                  <div className="bn-thumb">
                    {b.type === 'video' ? <video src={b.mediaUrl} muted /> : <img src={b.mediaUrl} alt={b.alt || ''} />}
                    <span className="bn-tag">{b.type === 'video' ? 'Video' : 'Image'}</span>
                  </div>
                )}
              </div>

              <div className="bn-fields">
                <div className="ui-field">
                  <label htmlFor={`bt-${b.id}`}>Title <span className="ui-optional">Internal</span></label>
                  <input id={`bt-${b.id}`} type="text" value={b.title || ''} maxLength={80} placeholder="e.g. Diwali sale" onChange={(e) => update(b.id, { title: e.target.value })} />
                </div>
                <div className="ui-field">
                  <label htmlFor={`bl-${b.id}`}>Link <span className="ui-optional">Optional</span></label>
                  <LinkPicker id={`bl-${b.id}`} value={b.link || ''} products={products} onChange={(v) => update(b.id, { link: v })} />
                </div>
                <div className="ui-field">
                  <span className="ui-label">Schedule <span className="ui-optional">Optional</span></span>
                  <DateRangePicker label="Schedule" emptyText="Always on" from={b.startDate || ''} to={b.endDate || ''} onChange={({ from, to }) => update(b.id, { startDate: from, endDate: to })} fullWidth />
                </div>
                <div className="ui-field">
                  <label htmlFor={`ba-${b.id}`}>Alt text <span className="ui-optional">For screen readers</span></label>
                  <input id={`ba-${b.id}`} type="text" value={b.alt || ''} maxLength={160} placeholder="Describe the image" onChange={(e) => update(b.id, { alt: e.target.value })} />
                </div>
                <div className="ui-field is-wide">
                  <span className="ui-label">Mobile image <span className="ui-optional">Optional · falls back to the desktop one</span></span>
                  {b.mobileMediaUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <img src={b.mobileMediaUrl} alt="" style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => update(b.id, { mobileMediaUrl: '' })}>Remove mobile image</button>
                    </div>
                  ) : b.type === 'image' ? (
                    <UploadZone folder="banners" types={IMAGE_ONLY} multiple={false} maxFiles={1} label="Add a mobile image" hint="1080×1350 (4:5)" onUploaded={(url) => update(b.id, { mobileMediaUrl: url })} />
                  ) : (
                    <span className="ui-hint">Videos use the same file on every device.</span>
                  )}
                </div>
              </div>

              <div className="bn-side">
                <StatusBadge kind="schedule" value={state} label={SCHEDULE_LABELS[state]} />
                <Switch checked={b.isActive} onChange={(v) => update(b.id, { isActive: v })} label={b.isActive ? 'Active' : 'Off'} />
                <RowMenu
                  items={[
                    { label: 'Preview', icon: Eye, onClick: () => setPreviewing(true) },
                    { label: 'Replace media', icon: Replace, onClick: () => setReplacing(b.id) },
                    { label: 'Remove', icon: Trash2, danger: true, onClick: () => setRemoving(b) },
                  ]}
                />
                {problem && <span className="ui-error">{problem}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <section className="admin-form-section" style={{ marginTop: 'var(--space-5)' }}>
        <h3>Add a banner</h3>
        {banners.length >= MAX_BANNERS ? (
          <p className="ui-muted">You have {MAX_BANNERS} banners, the most the homepage holds. Remove one to add another.</p>
        ) : (
          <>
            <UploadZone folder="banners" types={MEDIA_TYPES} maxMb={10} multiple maxFiles={MAX_BANNERS - banners.length} label="Drop images or an MP4 here, or click to upload" hint="JPG, PNG, WebP or MP4 · the type is detected for you" onUploaded={addMedia} />
            <p className="bn-recommend" style={{ marginTop: 'var(--space-3)' }}>
              Recommended: desktop <strong>1920×800</strong> · mobile <strong>1080×1350</strong> · MP4 under <strong>10 MB</strong>.
            </p>
          </>
        )}
      </section>

      <StickySaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setBanners(JSON.parse(saved))} />

      <BannerPreview open={previewing} onClose={() => setPreviewing(false)} banners={banners} />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove banner?"
        message={removing ? `“${removing.title || 'This banner'}” will be removed from the homepage when you save.` : ''}
        onConfirm={() => { setBanners((prev) => prev.filter((x) => x.id !== removing.id)); setRemoving(null); }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
