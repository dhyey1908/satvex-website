import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, Layers, MessageCircle, Trash2, Mail } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { ErrorState } from '../../components/ErrorState';
import { Drawer } from '../../components/Drawer';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { RowMenu } from '../../components/admin/RowMenu';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminList } from '../../hooks/useAdminList';
import { CONTACT_STATUS_LABELS } from '../../utils/statusTones';
import { formatShortDateTime } from '../../utils/dateRange';
import { whatsappLink } from '../../utils/whatsapp';
import { ENQUIRY_TYPE_LABELS, enquiryTypeLabel } from '../../utils/contactEnquiry';
import './Admin.css';
import './AdminLists.css';

const STATUSES = ['open', 'in_progress', 'resolved'];
const LIST_DEFAULTS = { sortBy: 'createdAt', sortDir: 'desc', filters: { enquiryType: '', status: '', dateFrom: '', dateTo: '' } };

const REPLY_TEMPLATES = [
  { label: 'Looking into it', text: (n) => `Hi ${n}, thank you for reaching out to SATVEX. We're looking into this and will get back to you shortly.` },
  { label: 'Order shipped', text: (n) => `Hi ${n}, your SATVEX order has been shipped. You can track it with the link we sent. Thank you for shopping with us!` },
  { label: 'Refund started', text: (n) => `Hi ${n}, we've started your refund. It usually reaches your account in 5-7 working days.` },
  { label: 'Need photos', text: (n) => `Hi ${n}, sorry about this! Could you share a photo of the item so we can sort it out quickly?` },
];

function ContactDrawer({ contact, onClose, onChanged }) {
  const { showToast } = useToast();
  const [note, setNote] = useState(contact.adminNote || '');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const wa = whatsappLink(contact.phone, reply);

  async function setStatus(status) {
    setSaving(true);
    try {
      await adminService.updateContactStatus(contact.contactId, status);
      showToast(`Marked ${CONTACT_STATUS_LABELS[status].toLowerCase()}`, 'success');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setSaving(true);
    try {
      await adminService.setContactNote(contact.contactId, note);
      showToast('Note saved', 'success');
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={enquiryTypeLabel(contact.enquiryType)}>
      <div className="od">
        <div className="od-badges">
          <StatusBadge kind="contact" value={contact.status} label={CONTACT_STATUS_LABELS[contact.status]} />
          <StatusBadge tone="outline" label={enquiryTypeLabel(contact.enquiryType)} />
        </div>
        <p className="ui-muted od-time">Received {formatShortDateTime(contact.createdAt)} IST</p>
        <p className="ct-message">{contact.message}</p>

        <section>
          <h4>Customer</h4>
          <div className="od-row"><span>Name</span><span>{contact.name}</span></div>
          <div className="od-row"><span>Phone</span><span>{contact.phone || '—'}</span></div>
          <div className="od-row"><span>Email</span><span>{contact.email || '—'}</span></div>
          {contact.orderId && (
            <div className="od-row"><span>Linked order</span><Link to={`/admin/orders/${contact.orderId}`}>#{String(contact.orderId).slice(0, 8)} <ExternalLink size={12} /></Link></div>
          )}
          {contact.returnReason && <div className="od-row"><span>Reason</span><span>{contact.returnReason}</span></div>}
          {contact.cancelReason && <div className="od-row"><span>Cancel reason</span><span>{contact.cancelReason}</span></div>}
          {contact.transactionRef && <div className="od-row"><span>Transaction</span><span>{contact.transactionRef}</span></div>}
          {(contact.attachments || []).map((a, i) => (
            <a key={a.url || i} href={a.url} target="_blank" rel="noreferrer" className="od-links">Attachment {i + 1}</a>
          ))}
        </section>

        <section>
          <h4>Status</h4>
          <div className="od-badges">
            {STATUSES.map((s) => (
              <button key={s} type="button" className={`btn btn-sm ${contact.status === s ? 'btn-primary' : 'btn-outline'}`} disabled={saving || contact.status === s} onClick={() => setStatus(s)}>
                {CONTACT_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Reply on WhatsApp</h4>
          <div className="ct-templates">
            {REPLY_TEMPLATES.map((t) => (
              <button key={t.label} type="button" onClick={() => setReply(t.text(contact.name || 'there'))}>{t.label}</button>
            ))}
          </div>
          <div className="ui-field" style={{ marginTop: 'var(--space-3)' }}>
            <textarea aria-label="Reply message" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Pick a template or type a reply…" />
          </div>
          {wa ? (
            <a className="btn btn-primary btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Open WhatsApp</a>
          ) : (
            <p className="ui-hint">No valid phone number on this message.</p>
          )}
        </section>

        <section className="ct-note">
          <h4>Internal note · only you see this</h4>
          <div className="ui-field">
            <textarea aria-label="Internal note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={saveNote} disabled={saving || note === (contact.adminNote || '')}>Save note</button>
        </section>
      </div>
    </Drawer>
  );
}

export function AdminContacts() {
  const { showToast } = useToast();
  const list = useAdminList({ fetcher: adminService.contacts, resultKey: 'contacts', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: contacts, filters, setFilter, facets } = list;
  const counts = facets.counts || { status: {}, enquiryType: {} };
  const [openId, setOpenId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null); // { ids, label }
  const [busy, setBusy] = useState(false);
  const [readIds, setReadIds] = useState(() => new Set());
  const total = list.pagination?.total ?? 0;
  const rows = contacts || [];
  const open = rows.find((c) => c.contactId === openId) || null;

  // The drawer reads from the list, so a change refreshes the list underneath it.
  useEffect(() => {
    if (open?.unread && !readIds.has(open.contactId)) {
      setReadIds((s) => new Set(s).add(open.contactId));
      adminService.markContactRead(open.contactId).catch(() => {});
    }
  }, [open, readIds]);

  const isUnread = (c) => c.unread && !readIds.has(c.contactId);

  async function resolve(ids) {
    setBusy(true);
    const results = await Promise.allSettled(ids.map((id) => adminService.updateContactStatus(id, 'resolved')));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (ids.length - failed) showToast(`${countLabel(ids.length - failed, 'message')} marked resolved`, 'success');
    if (failed) showToast(`${failed} could not be updated`, 'error');
    setSelected([]);
    list.reload();
  }

  async function remove() {
    setBusy(true);
    const results = await Promise.allSettled(confirm.ids.map((id) => adminService.removeContact(id)));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (confirm.ids.length - failed) showToast(`${countLabel(confirm.ids.length - failed, 'message')} deleted`, 'success');
    if (failed) showToast(`${failed} could not be deleted`, 'error');
    setConfirm(null);
    setSelected([]);
    setOpenId(null);
    list.reload();
  }

  const menu = (c) => {
    const wa = whatsappLink(c.phone, `Hi ${c.name || ''}, thank you for contacting SATVEX.`);
    return [
      { label: 'Reply on WhatsApp', icon: MessageCircle, href: wa, hidden: !wa },
      { label: 'Copy phone', icon: Copy, hidden: !c.phone, onClick: () => navigator.clipboard?.writeText(c.phone).then(() => showToast('Phone copied', 'success')) },
      { label: 'Delete / mark as spam', icon: Trash2, danger: true, onClick: () => setConfirm({ ids: [c.contactId], label: `the message from ${c.name || 'this customer'}` }) },
    ];
  };

  const columns = [
    {
      key: 'date',
      header: 'Date',
      sortField: 'createdAt',
      firstDir: 'desc',
      className: 'ui-cell-primary',
      render: (c) => (
        <span className="ui-cell-main">
          {isUnread(c) && <span className="ui-unread-dot" aria-label="Unread" />}
          {formatShortDateTime(c.createdAt)}
        </span>
      ),
    },
    { key: 'type', header: 'Type', render: (c) => <StatusBadge tone="outline" label={enquiryTypeLabel(c.enquiryType)} /> },
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <>
          <span className="ui-cell-main">{c.name}</span>
          <span className="ui-cell-sub">{c.phone || c.email || '—'}</span>
        </>
      ),
    },
    { key: 'message', header: 'Message', render: (c) => <span className="ui-cell-sub-clamp" style={{ margin: 0 }}>{c.message}</span> },
    {
      key: 'order',
      header: 'Order',
      render: (c) => (c.orderId ? <Link to={`/admin/orders/${c.orderId}`}>#{String(c.orderId).slice(0, 8)}</Link> : <span className="ui-muted">—</span>),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge kind="contact" value={c.status} label={CONTACT_STATUS_LABELS[c.status]} /> },
    {
      key: 'actions',
      header: '',
      className: 'ui-cell-actions',
      render: (c) => (
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          {c.status !== 'resolved' && (
            <button type="button" className="ui-icon-btn" title="Mark resolved" aria-label={`Mark message from ${c.name} resolved`} onClick={() => resolve([c.contactId])}>
              <CheckCircle2 size={18} />
            </button>
          )}
          <RowMenu items={menu(c)} />
        </div>
      ),
    },
  ];

  const chips = [
    {
      key: 'enquiryType',
      label: 'Category',
      icon: Layers,
      options: Object.entries(ENQUIRY_TYPE_LABELS).map(([value, label]) => ({ value, label, count: counts.enquiryType?.[value] || 0 })),
    },
    { key: 'status', label: 'Status', icon: Mail, options: STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_LABELS[s], tone: s === 'open' ? 'amber' : s === 'resolved' ? 'green' : 'blue', count: counts.status?.[s] || 0 })) },
  ];

  const tabs = [...STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_LABELS[s], n: counts.status?.[s] || 0 })), { value: '', label: 'All', n: counts.total || 0 }];

  return (
    <div>
      <PageHeader title="Contact messages" subtitle={contacts ? `${countLabel(total, 'message')}${facets.counts?.unread ? ` · ${facets.counts.unread} unread` : ''}` : ' '} />

      <div className="al-tabs" role="tablist" aria-label="Message status">
        {tabs.map((t) => (
          <button key={t.label} type="button" role="tab" aria-selected={filters.status === t.value} className={`al-tab ${filters.status === t.value ? 'is-on' : ''}`} onClick={() => { setFilter('status', t.value); setSelected([]); }}>
            {t.label} <span className="al-tab-count">{t.n}</span>
          </button>
        ))}
      </div>

      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search name, phone, order ID, message…' }}
        chips={chips}
        values={filters}
        onChange={(k, v) => { setFilter(k, v); setSelected([]); }}
        date={{ label: 'Date', from: filters.dateFrom, to: filters.dateTo, onChange: ({ from, to }) => { setFilter('dateFrom', from); setFilter('dateTo', to); } }}
        onClearAll={list.clearFilters}
        resultText={contacts ? `Showing ${rows.length} of ${total} messages` : null}
        searchLabel="Search messages"
      />

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={contacts}
            rowKey={(c) => c.contactId}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            onRowClick={(c) => setOpenId(c.contactId)}
            rowClassName={(c) => (isUnread(c) ? 'is-unread' : '')}
            select={{
              selected,
              onToggle: (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
              onToggleAll: (pageRows) => {
                const ids = pageRows.map((r) => r.contactId);
                setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
              },
            }}
            caption="Contact messages"
            empty={
              <TableEmpty
                icon={Mail}
                title={list.hasActiveFilters ? 'No messages match these filters' : 'No messages yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Customer enquiries from the Contact page show up here.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="messages" />
        </>
      )}

      {selected.length > 0 && (
        <div className="al-bulk" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => resolve(selected)}>Mark resolved</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirm({ ids: selected, label: countLabel(selected.length, 'selected message') })}>Delete</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {open && <ContactDrawer contact={open} onClose={() => setOpenId(null)} onChanged={list.reload} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete message?"
        message={confirm ? `This permanently deletes ${confirm.label}. It cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
