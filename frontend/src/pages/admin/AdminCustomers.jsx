import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, MessageCircle, ShoppingBag, UserRound } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useToast } from '../../context/ToastContext';
import { ErrorState } from '../../components/ErrorState';
import { Drawer } from '../../components/Drawer';
import { PageHeader, countLabel } from '../../components/admin/PageHeader';
import { FilterBar } from '../../components/admin/FilterBar';
import { DataTable, TableEmpty, TableFooter } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { RowMenu } from '../../components/admin/RowMenu';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDay, formatShortDateTime } from '../../utils/dateRange';
import { downloadCsv, rupees } from '../../utils/csv';
import { whatsappLink } from '../../utils/whatsapp';
import './Admin.css';
import './AdminLists.css';

const LIST_DEFAULTS = { sortBy: 'createdAt', sortDir: 'desc', filters: { hasOrders: '', dateFrom: '', dateTo: '' } };

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const day = (iso) => (iso ? formatDay(new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)) : '—');

function CustomerDrawer({ customer, onClose }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    let alive = true;
    adminService.orders({ userId: customer.userId, pageSize: 50 }).then((d) => alive && setOrders(d.orders)).catch(() => alive && setOrders([]));
    return () => { alive = false; };
  }, [customer.userId]);

  const wa = whatsappLink(customer.phone, `Hi ${customer.name || ''}, this is SATVEX.`);
  const addresses = [...new Map((orders || []).filter((o) => o.address?.line1).map((o) => [`${o.address.line1}|${o.address.pincode}`, o.address])).values()];

  return (
    <Drawer open onClose={onClose} title={customer.name || 'Customer'}>
      <div className="od">
        <div className="ui-person">
          <span className="ui-avatar">{initials(customer.name)}</span>
          <div>
            <div className="ui-cell-main">{customer.name || '—'} {customer.isStaff && <StatusBadge tone="grey" label="Staff account" />}</div>
            <span className="ui-cell-sub">{customer.phone || 'No phone'} · {customer.email || 'No email'}</span>
          </div>
        </div>
        <div className="cd-stats">
          <div className="cd-stat"><strong>{rupees(customer.totalSpent)}</strong><span>Lifetime value</span></div>
          <div className="cd-stat"><strong>{customer.orderCount}</strong><span>Orders</span></div>
          <div className="cd-stat"><strong>{customer.prepaidCount}</strong><span>Prepaid</span></div>
          <div className="cd-stat"><strong>{customer.codCount}</strong><span>COD</span></div>
        </div>
        <p className="ui-muted">Registered {day(customer.createdAt)} · Last order {customer.lastOrderAt ? formatShortDateTime(customer.lastOrderAt) : '—'}</p>
        {wa && <a className="btn btn-outline btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a>}

        <section>
          <h4>Addresses used</h4>
          {orders === null ? <span className="ui-skeleton" /> : addresses.length === 0 ? <p className="ui-muted">None yet.</p> : addresses.map((a) => (
            <p key={`${a.line1}${a.pincode}`} className="od-address">{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}</p>
          ))}
        </section>

        <section>
          <h4>Orders</h4>
          {orders === null ? <span className="ui-skeleton" /> : orders.length === 0 ? <p className="ui-muted">No orders yet.</p> : orders.map((o) => (
            <div className="cd-order" key={o.orderId}>
              <Link to={`/admin/orders/${o.orderId}`}>#{o.orderId.slice(0, 8)}</Link>
              <span className="ui-muted">{formatShortDateTime(o.createdAt)}</span>
              <StatusBadge kind="order" value={o.status} />
              <strong>{rupees(o.total)}</strong>
            </div>
          ))}
        </section>
      </div>
    </Drawer>
  );
}

export function AdminCustomers() {
  const { showToast } = useToast();
  const list = useAdminList({ fetcher: adminService.customers, resultKey: 'customers', defaults: LIST_DEFAULTS, pageSize: 25, urlSync: true });
  const { items: customers, filters, setFilter } = list;
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const total = list.pagination?.total ?? 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await list.fetchAll();
      downloadCsv(
        `customers-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Name', 'Phone', 'Email', 'Registered', 'Orders', 'Total spent', 'Last order', 'Account'],
        all.map((c) => [c.name, c.phone, c.email, day(c.createdAt), c.orderCount, Number(c.totalSpent || 0).toFixed(2), c.lastOrderAt ? formatShortDateTime(c.lastOrderAt) : '', c.isStaff ? 'Staff' : 'Customer'])
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  const menu = (c) => {
    const wa = whatsappLink(c.phone, `Hi ${c.name || ''}, this is SATVEX.`);
    return [
      { label: 'View customer', icon: UserRound, onClick: () => setOpen(c) },
      { label: 'WhatsApp', icon: MessageCircle, href: wa, hidden: !wa },
      { label: 'Copy phone', icon: Copy, hidden: !c.phone, onClick: () => navigator.clipboard?.writeText(c.phone).then(() => showToast('Phone copied', 'success')) },
    ];
  };

  const columns = [
    {
      key: 'customer',
      header: 'Customer',
      sortField: 'name',
      className: 'ui-cell-primary',
      render: (c) => (
        <div className="ui-person">
          <span className="ui-avatar">{initials(c.name)}</span>
          <div>
            <span className="ui-cell-main">{c.name || '—'} {c.isStaff && <StatusBadge tone="grey" label="Staff" title="An admin account that has placed orders" />}</span>
            <span className="ui-cell-sub">{c.phone || '—'}</span>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (c) => c.email || <span className="ui-muted">—</span> },
    { key: 'registered', header: 'Registered', sortField: 'createdAt', firstDir: 'desc', render: (c) => day(c.createdAt) },
    { key: 'orders', header: 'Orders', sortField: 'orderCount', firstDir: 'desc', className: 'ui-num', render: (c) => c.orderCount },
    { key: 'spent', header: 'Total spent', sortField: 'totalSpent', firstDir: 'desc', className: 'ui-num', render: (c) => <span className="ui-cell-main">{rupees(c.totalSpent)}</span> },
    { key: 'last', header: 'Last order', sortField: 'lastOrderAt', firstDir: 'desc', render: (c) => (c.lastOrderAt ? formatShortDateTime(c.lastOrderAt) : <span className="ui-muted">—</span>) },
    { key: 'menu', header: '', className: 'ui-cell-actions', render: (c) => <RowMenu items={menu(c)} /> },
  ];

  const chips = [
    {
      key: 'hasOrders',
      label: 'Customers',
      icon: ShoppingBag,
      options: [
        { value: 'yes', label: 'With orders' },
        { value: 'no', label: 'No orders yet' },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={customers ? countLabel(total, 'customer') : ' '}
        actions={
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={exporting || total === 0}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />
      <FilterBar
        search={{ value: list.searchInput, onChange: list.setSearchInput, placeholder: 'Search name, phone or email…' }}
        chips={chips}
        values={filters}
        onChange={setFilter}
        date={{ label: 'Registered', from: filters.dateFrom, to: filters.dateTo, onChange: ({ from, to }) => { setFilter('dateFrom', from); setFilter('dateTo', to); } }}
        onClearAll={list.clearFilters}
        resultText={customers ? `Showing ${customers.length} of ${total} customers` : null}
        searchLabel="Search customers"
      />
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={customers}
            rowKey={(c) => c.userId}
            loading={list.loading}
            sort={{ sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort }}
            onRowClick={setOpen}
            caption="Customers"
            empty={
              <TableEmpty
                icon={UserRound}
                title={list.hasActiveFilters ? 'No customers match these filters' : 'No customers yet'}
                message={list.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Customers appear here once they sign up.'}
                filtered={list.hasActiveFilters}
                onClear={list.clearFilters}
              />
            }
          />
          <TableFooter paginationProps={list.paginationProps} pageSize={list.pageSize} onPageSize={list.setPageSize} itemLabel="customers" />
        </>
      )}
      {open && <CustomerDrawer customer={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
