import { useState } from 'react';
import { AlertTriangle, CircleDollarSign, Copy, Download, Eye, FileText, MessageCircle, Package, Tag, Truck, Wallet, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { RowMenu } from '../../components/admin/RowMenu';
import { OrderDrawer } from './OrderDrawer';
import { useAdminList } from '../../hooks/useAdminList';
import { effectivePaymentStatus } from '../../utils/paymentStatus';
import { PAYMENT_LABELS, SHIPMENT_LABELS, toneFor } from '../../utils/statusTones';
import { formatShortDateTime } from '../../utils/dateRange';
import { downloadCsv, rupees } from '../../utils/csv';
import { itemImage } from '../../utils/itemImage';
import { whatsappLink } from '../../utils/whatsapp';
import './Admin.css';
import './AdminLists.css';

const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const TABS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const PAYMENT_STATES = ['paid', 'awaiting', 'confirming', 'failed', 'dropped', 'expired'];
const SHIPMENT_STATES = Object.keys(SHIPMENT_LABELS);

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { status: '', paymentMethod: '', paymentStatus: '', shipmentStatus: '', courier: '', deliveryStatus: '', dateFrom: '', dateTo: '' },
};

const colourNames = (item) => (item.selectedColorDetails || []).map((c) => c.colorName).filter(Boolean).join(', ');
const itemsSummary = (order) => {
  const [first, ...rest] = order.items || [];
  if (!first) return '—';
  const text = `${first.sellingOptionName || first.productName}${colourNames(first) ? ` · ${colourNames(first)}` : ''}`;
  return rest.length ? `${text} (+${rest.length} more)` : text;
};
const paymentKey = (o) => (o.paymentMethod === 'Online' ? effectivePaymentStatus(o) || o.paymentStatus : 'not_required');

export function AdminOrders() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const list = useAdminList({ fetcher: adminService.orders, resultKey: 'orders', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: orders, filters, setFilter, facets } = list;
  const counts = facets.counts || { status: {}, paymentStatus: {}, shipmentStatus: {}, paymentMethod: {} };
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(null);

  const change = (key, value) => {
    setFilter(key, value);
    setSelected([]);
  };
  const rows = orders || [];
  const selectedRows = rows.filter((o) => selected.includes(o.orderId));

  async function exportCsv(only) {
    setExporting(true);
    try {
      const all = only || (await list.fetchAll());
      downloadCsv(
        `orders-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Order ID', 'Placed (IST)', 'Customer', 'Phone', 'Email', 'Items', 'Total', 'Method', 'Status', 'Payment', 'Shipping', 'AWB'],
        all.map((o) => [
          o.orderId,
          formatShortDateTime(o.createdAt),
          o.customer?.name,
          o.customer?.phone,
          o.customer?.email,
          itemsSummary(o),
          Number(o.total || 0).toFixed(2),
          o.paymentMethod === 'Online' ? 'Prepaid' : 'COD',
          o.status,
          PAYMENT_LABELS[paymentKey(o)] || paymentKey(o),
          SHIPMENT_LABELS[o.shipmentStatus || 'not_created'],
          o.awbCode,
        ])
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  async function markProcessing() {
    setBusy(true);
    const results = await Promise.allSettled(selected.map((id) => adminService.updateOrderStatus(id, 'Processing')));
    setBusy(false);
    const failed = results.filter((r) => r.status === 'rejected');
    const done = results.length - failed.length;
    if (done) showToast(`${countLabel(done, 'order')} marked Processing`, 'success');
    if (failed.length) showToast(`${failed.length} could not be changed: ${failed[0].reason?.message || 'not allowed'}`, 'error');
    setSelected([]);
    list.reload();
  }

  function printLabels() {
    const urls = selectedRows.map((o) => o.labelUrl).filter(Boolean);
    if (urls.length === 0) {
      showToast('None of the selected orders has a shipping label yet.', 'error');
      return;
    }
    urls.forEach((u) => window.open(u, '_blank', 'noopener'));
    if (urls.length < selectedRows.length) showToast(`${selectedRows.length - urls.length} selected order(s) have no label yet.`, 'error');
  }

  const rowMenu = (o) => {
    const wa = whatsappLink(o.customer?.phone, `Hi ${o.customer?.name || ''}, this is SATVEX about your order ${o.orderId.slice(0, 8)}.`);
    return [
      { label: 'View order', icon: Eye, onClick: () => navigate(`/admin/orders/${o.orderId}`) },
      { label: 'Copy order ID', icon: Copy, onClick: () => navigator.clipboard?.writeText(o.orderId).then(() => showToast('Order ID copied', 'success')) },
      { label: 'WhatsApp customer', icon: MessageCircle, href: wa, hidden: !wa },
      { label: 'Print invoice', icon: FileText, href: o.invoiceUrl, hidden: !o.invoiceUrl },
    ];
  };

  const columns = [
    {
      key: 'order',
      header: 'Order',
      sortField: 'createdAt',
      firstDir: 'desc',
      className: 'ui-cell-primary',
      render: (o) => (
        <>
          <span className="ui-cell-main">
            #{o.orderId.slice(0, 8)}
            {o.conflicts?.length > 0 && (
              <span className="ui-warn" title={o.conflicts.join(' ')}>
                <AlertTriangle size={14} aria-label="Statuses conflict" />
              </span>
            )}
            {o.needsReview && <AlertTriangle size={14} className="admin-needs-review-icon" title="Needs review" />}
          </span>
          <span className="ui-cell-sub">{formatShortDateTime(o.createdAt)}</span>
        </>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <>
          <span className="ui-cell-main">{o.customer?.name || '—'}</span>
          <span className="ui-cell-sub">{o.customer?.phone || '—'}</span>
        </>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      className: 'ui-wrap',
      render: (o) => {
        const img = o.items?.[0] && itemImage(o.items[0]);
        return (
          <div className="al-items">
            {img ? <img src={img} alt="" loading="lazy" /> : <span className="al-items-blank" />}
            <span>{itemsSummary(o)}</span>
          </div>
        );
      },
    },
    { key: 'total', header: 'Total', sortField: 'total', firstDir: 'desc', className: 'ui-num', render: (o) => <span className="ui-cell-main">{rupees(o.total)}</span> },
    {
      key: 'method',
      header: 'Method',
      sortField: 'paymentMethod',
      render: (o) => <StatusBadge tone="outline" label={o.paymentMethod === 'Online' ? 'Prepaid' : 'COD'} />,
    },
    { key: 'status', header: 'Status', sortField: 'status', render: (o) => <StatusBadge kind="order" value={o.status} /> },
    {
      key: 'payment',
      header: 'Payment',
      sortField: 'paymentStatus',
      render: (o) => <StatusBadge kind="payment" value={paymentKey(o)} label={PAYMENT_LABELS[paymentKey(o)] || paymentKey(o)} />,
    },
    {
      key: 'shipping',
      header: 'Shipping',
      sortField: 'shipmentStatus',
      render: (o) => {
        const s = o.shipmentStatus || 'not_created';
        return <StatusBadge kind="shipment" value={s} label={SHIPMENT_LABELS[s] || s} />;
      },
    },
    { key: 'menu', header: '', className: 'ui-cell-actions', render: (o) => <RowMenu items={rowMenu(o)} /> },
  ];

  const opt = (values, labels, bucket, kind) => values.map((v) => ({ value: v, label: labels?.[v] || v, tone: toneFor(kind, v), count: counts[bucket]?.[v] || 0 }));
  const chips = [
    { key: 'status', label: 'Status', icon: Package, multi: true, options: opt(STATUSES, null, 'status', 'order') },
    {
      key: 'paymentMethod',
      label: 'Method',
      icon: Wallet,
      options: [
        { value: 'COD', label: 'COD', count: counts.paymentMethod?.COD || 0 },
        { value: 'Online', label: 'Prepaid', count: counts.paymentMethod?.Online || 0 },
      ],
    },
    { key: 'paymentStatus', label: 'Payment', icon: CreditCard, multi: true, options: opt(PAYMENT_STATES, PAYMENT_LABELS, 'paymentStatus', 'payment') },
    { key: 'shipmentStatus', label: 'Shipping', icon: Truck, multi: true, options: opt(SHIPMENT_STATES, SHIPMENT_LABELS, 'shipmentStatus', 'shipment') },
  ];
  if (facets.couriers?.length) chips.push({ key: 'courier', label: 'Courier', icon: Tag, secondary: true, options: facets.couriers.map((c) => ({ value: c, label: c })) });
  if (facets.deliveryStatuses?.length) chips.push({ key: 'deliveryStatus', label: 'Delivery', icon: CircleDollarSign, secondary: true, options: facets.deliveryStatuses.map((c) => ({ value: c, label: c })) });

  const total = list.pagination?.total ?? 0;
  const sort = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: (f, d) => { list.toggleSort(f, d); setSelected([]); } };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={orders ? countLabel(counts.total ?? total, 'order') : ' '}
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={() => exportCsv()} disabled={exporting || total === 0}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />

      <div className="al-tabs" role="tablist" aria-label="Order status">
        <button type="button" role="tab" aria-selected={!filters.status} className={`al-tab ${!filters.status ? 'is-on' : ''}`} onClick={() => change('status', '')}>
          All <span className="al-tab-count">{counts.total ?? 0}</span>
        </button>
        {TABS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={filters.status === s} className={`al-tab ${filters.status === s ? 'is-on' : ''}`} onClick={() => change('status', s)}>
            {s} <span className="al-tab-count">{counts.status?.[s] || 0}</span>
          </button>
        ))}
      </div>

      <FilterBar
        search={{ value: list.searchInput, onChange: (v) => { list.setSearchInput(v); setSelected([]); }, placeholder: 'Search order ID, name, phone, AWB…' }}
        chips={chips}
        values={filters}
        onChange={change}
        date={{ label: 'Date', from: filters.dateFrom, to: filters.dateTo, onChange: ({ from, to }) => { setFilter('dateFrom', from); setFilter('dateTo', to); setSelected([]); } }}
        onClearAll={() => { list.clearFilters(); setSelected([]); }}
        resultText={orders ? `Showing ${rows.length} of ${total} orders` : null}
        searchLabel="Search orders"
      />

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={orders}
            rowKey={(o) => o.orderId}
            loading={list.loading}
            sort={sort}
            onRowClick={setOpen}
            rowClassName={(o) => (o.conflicts?.length ? 'has-conflict' : '')}
            select={{
              selected,
              onToggle: (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
              onToggleAll: (pageRows) => {
                const ids = pageRows.map((r) => r.orderId);
                setSelected((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
              },
            }}
            caption="Orders"
            empty={
              <TableEmpty
                title={list.hasActiveFilters ? 'No orders match these filters' : 'No orders yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'New orders will show up here.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter
            paginationProps={list.paginationProps}
            pageSize={list.pageSize}
            onPageSize={(n) => { list.setPageSize(n); setSelected([]); }}
            onPageChange={(p) => { list.setPage(p); setSelected([]); }}
            itemLabel="orders"
          />
        </>
      )}

      {selected.length > 0 && (
        <div className="al-bulk" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => exportCsv(selectedRows)} disabled={exporting}>Export</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={markProcessing} disabled={busy}>{busy ? 'Updating…' : 'Mark processing'}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={printLabels}>Print labels</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <OrderDrawer order={open} onClose={() => setOpen(null)} />
    </div>
  );
}
