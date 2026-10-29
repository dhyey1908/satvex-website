import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Megaphone, Plus, SmilePlus, Trash2 } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { Loader } from '../../components/Loader';
import { PageHeader } from '../../components/admin/PageHeader';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { Switch } from '../../components/admin/Switch';
import { RowMenu } from '../../components/admin/RowMenu';
import { LinkPicker } from '../../components/admin/LinkPicker';
import { DateRangePicker } from '../../components/admin/DateRangePicker';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { StickySaveBar } from '../../components/admin/StickySaveBar';
import { InfoTip } from '../../components/admin/InfoTip';
import { linkProblem } from '../../utils/linkTargets';
import { SCHEDULE_LABELS, scheduleState } from '../../utils/statusTones';
import { todayIST } from '../../utils/dateRange';
import './Admin.css';
import './AdminLists.css';

const MAX_ANNOUNCEMENTS = 5;
const SOFT_LIMIT = 80; // what fits comfortably on a phone; the server allows up to 140
const HARD_LIMIT = 140;
const EMOJI = ['🎉', '✨', '🎁', '🚚', '💜', '🔥', '🛍️', '⭐'];
const COUPON_LABELS = { active: 'Active', inactive: 'Inactive', expired: 'Expired', exhausted: 'Used up' };
const blank = () => ({ id: crypto.randomUUID(), message: '', link: '', couponCode: '', startDate: '', endDate: '', isActive: true });

/** The bar exactly as shoppers see it, rotating through the messages that are live today. */
function BarPreview({ announcements }) {
  const [device, setDevice] = useState('desktop');
  const [index, setIndex] = useState(0);
  const today = todayIST();
  const live = announcements.filter((a) => a.message.trim() && scheduleState(a, today) === 'live');

  useEffect(() => {
    if (live.length < 2) return undefined;
    const t = setInterval(() => setIndex((i) => i + 1), 3500);
    return () => clearInterval(t);
  }, [live.length]);

  const current = live[index % Math.max(live.length, 1)];
  return (
    <section className="an-preview" aria-label="Live preview">
      <div className="an-preview-head">
        <h3>Live preview</h3>
        <div className="an-seg" role="group" aria-label="Device">
          {['desktop', 'mobile'].map((d) => (
            <button key={d} type="button" className={device === d ? 'is-on' : ''} aria-pressed={device === d} onClick={() => setDevice(d)}>
              {d === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
      </div>
      <div className={`an-frame ${device === 'mobile' ? 'is-mobile' : ''}`}>
        <div className="an-bar">
          {current ? (
            <>
              <span>{current.message}</span>
              {current.couponCode && <span className="an-bar-code">{current.couponCode}</span>}
            </>
          ) : (
            <span>Nothing is live — the bar is hidden on the site.</span>
          )}
        </div>
      </div>
      {live.length > 1 && <p className="ui-hint" style={{ textAlign: 'center', margin: 'var(--space-2) 0 0' }}>{live.length} messages rotate every few seconds.</p>}
    </section>
  );
}

export function AdminAnnouncements() {
  const { showToast } = useToast();
  const [items, setItems] = useState(null);
  const [saved, setSaved] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [emojiFor, setEmojiFor] = useState(null);
  const [armed, setArmed] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    adminService.getSettings().then((data) => {
      const list = data.settings.announcements || [];
      setItems(list);
      setSaved(JSON.stringify(list));
    });
    adminService.products({ pageSize: 100 }).then((d) => setProducts((d.products || []).map((p) => ({ slug: p.slug, name: p.name })))).catch(() => setProducts(null));
    adminService.getCoupons({ pageSize: 100 }).then((d) => setCoupons(d.coupons || [])).catch(() => setCoupons([]));
  }, []);

  const dirty = items !== null && JSON.stringify(items) !== saved;
  const today = todayIST();
  const update = (id, patch) => setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const move = (from, to) =>
    setItems((prev) => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });

  async function save() {
    const empty = items.findIndex((a) => !a.message.trim());
    if (empty !== -1) {
      showToast(`Message ${empty + 1} is empty — write something or remove it.`, 'error');
      return;
    }
    const bad = items.find((a) => linkProblem(a.link, products));
    if (bad) {
      showToast(`Fix the link on “${bad.message.slice(0, 30)}”: ${linkProblem(bad.link, products)}`, 'error');
      return;
    }
    setSaving(true);
    try {
      await adminService.updateSettings({ announcements: items });
      setSaved(JSON.stringify(items));
      showToast('Announcements saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!items) return <Loader label="Loading announcements…" />;
  const atLimit = items.length >= MAX_ANNOUNCEMENTS;

  return (
    <div>
      <PageHeader
        title="Announcement bar"
        subtitle={`${items.length} of ${MAX_ANNOUNCEMENTS} messages used`}
        actions={
          <button type="button" className="btn btn-outline btn-sm" disabled={atLimit} onClick={() => setItems((prev) => [...prev, blank()])}>
            <Plus size={14} /> Add announcement
          </button>
        }
      />
      <p className="ui-muted" style={{ marginTop: 0, maxWidth: '44rem' }}>
        The strip above the header on every page. Messages rotate; changes go live when you save.{' '}
        <InfoTip label="How coupons work here">
          A coupon attached to a message appears as a “Copy code” button only while that coupon is active and valid. The code is never added to your message text, so mention the offer in the message if you want to.
        </InfoTip>
      </p>

      <BarPreview announcements={items} />

      <div className="bn-list">
        {items.length === 0 && <div className="ui-empty"><div className="ui-empty-icon"><Megaphone size={26} /></div><h3>No announcements</h3><p>The bar is hidden on the site until you add one.</p></div>}

        {items.map((a, index) => {
          const state = scheduleState(a, today);
          const known = coupons.some((c) => c.code === a.couponCode);
          return (
            <div
              key={a.id}
              className={`an-card ${state === 'expired' ? 'is-expired' : ''} ${dragId === a.id ? 'is-dragging' : ''}`}
              draggable={armed === a.id}
              onDragStart={() => setDragId(a.id)}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); move(items.findIndex((x) => x.id === dragId), index); setDragId(null); setArmed(null); }}
              onDragEnd={() => { setDragId(null); setArmed(null); }}
            >
              <div className="an-row1">
                <div className="bn-handle" style={{ paddingTop: 0 }}>
                  <button type="button" aria-label={`Move message ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronUp size={16} /></button>
                  <span role="img" aria-label="Drag to reorder" onPointerDown={() => setArmed(a.id)} onPointerUp={() => setArmed(null)} style={{ display: 'inline-flex', touchAction: 'none' }}><GripVertical size={18} /></span>
                  <button type="button" aria-label={`Move message ${index + 1} down`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}><ChevronDown size={16} /></button>
                </div>
                <div className="ui-field">
                  <label htmlFor={`am-${a.id}`}>
                    Message
                    <span className={`ui-counter ${a.message.length > SOFT_LIMIT ? 'is-over' : ''}`}>{a.message.length}/{SOFT_LIMIT}</span>
                  </label>
                  <input id={`am-${a.id}`} type="text" value={a.message} maxLength={HARD_LIMIT} placeholder="e.g. Free shipping on orders above ₹499" onChange={(e) => update(a.id, { message: e.target.value })} />
                  <div>
                    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={emojiFor === a.id} onClick={() => setEmojiFor(emojiFor === a.id ? null : a.id)}>
                      <SmilePlus size={14} /> Emoji
                    </button>
                    {emojiFor === a.id && (
                      <div className="an-emoji">
                        {EMOJI.map((e) => (
                          <button key={e} type="button" aria-label={`Add ${e}`} onClick={() => update(a.id, { message: `${a.message}${a.message && !a.message.endsWith(' ') ? ' ' : ''}${e}` })}>{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
                  <StatusBadge kind="schedule" value={state} label={SCHEDULE_LABELS[state]} />
                  <Switch checked={a.isActive} onChange={(v) => update(a.id, { isActive: v })} label={a.isActive ? 'Active' : 'Off'} />
                </div>
                <RowMenu items={[{ label: 'Remove', icon: Trash2, danger: true, onClick: () => setRemoving(a) }]} />
              </div>

              <div className="an-row2">
                <div className="ui-field">
                  <label htmlFor={`al-${a.id}`}>Link <span className="ui-optional">Optional</span></label>
                  <LinkPicker id={`al-${a.id}`} value={a.link || ''} products={products} onChange={(v) => update(a.id, { link: v })} />
                </div>
                <div className="ui-field">
                  <label htmlFor={`ac-${a.id}`}>Coupon <span className="ui-optional">Optional</span></label>
                  <select id={`ac-${a.id}`} value={a.couponCode || ''} onChange={(e) => update(a.id, { couponCode: e.target.value })}>
                    <option value="">No coupon</option>
                    {coupons.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} · {COUPON_LABELS[c.effectiveStatus] || (c.isActive ? 'Active' : 'Inactive')}</option>
                    ))}
                    {a.couponCode && !known && <option value={a.couponCode}>{a.couponCode} · not found</option>}
                  </select>
                </div>
                <div className="ui-field">
                  <span className="ui-label">Schedule <span className="ui-optional">Optional</span></span>
                  <DateRangePicker label="Schedule" emptyText="Always on" from={a.startDate || ''} to={a.endDate || ''} onChange={({ from, to }) => update(a.id, { startDate: from, endDate: to })} fullWidth />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <StickySaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setItems(JSON.parse(saved))} />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove announcement?"
        message={removing ? `“${removing.message || 'This message'}” will be removed from the bar when you save.` : ''}
        onConfirm={() => { setItems((prev) => prev.filter((x) => x.id !== removing.id)); setRemoving(null); }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
