import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, DateFilter, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDate } from '../../utils/date';
import './Admin.css';

const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { hasOrders: '', dateFrom: '', dateTo: '' },
};

export function AdminCustomers() {
  const list = useAdminList({
    fetcher: adminService.customers,
    resultKey: 'customers',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: customers, filters, setFilter } = list;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };

  return (
    <div>
      <div className="admin-page-header">
        <h1>Customers</h1>
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by name, mobile number or email…"
          label="Search customers"
        />
        <select value={filters.hasOrders} onChange={(e) => setFilter('hasOrders', e.target.value)} aria-label="Orders">
          <option value="">All customers</option>
          <option value="yes">With orders</option>
          <option value="no">No orders yet</option>
        </select>
        <DateFilter label="Registered from" value={filters.dateFrom} max={filters.dateTo} onChange={(v) => setFilter('dateFrom', v)} />
        <DateFilter label="to" value={filters.dateTo} min={filters.dateFrom} onChange={(v) => setFilter('dateTo', v)} />
        <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
      </div>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && !customers && <Loader label="Loading customers…" />}
      {!list.error && customers?.length === 0 && (
        <EmptyState
          title={list.hasActiveFilters ? 'No customers match these filters' : 'No customers yet'}
          message={list.hasActiveFilters ? 'Try a different search or reset the filters.' : undefined}
        />
      )}

      {!list.error && customers?.length > 0 && (
        <>
          <ResultCount pagination={list.pagination} loading={list.loading} label="customers" />
          <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <SortableTh label="Name" field="name" {...sortProps} />
                  <th>Email</th>
                  <th>Phone</th>
                  <SortableTh label="Registered" field="createdAt" firstDir="desc" {...sortProps} />
                  <SortableTh label="Orders" field="orderCount" firstDir="desc" {...sortProps} />
                  <SortableTh label="Total Spent" field="totalSpent" firstDir="desc" {...sortProps} />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.userId}>
                    <td>{c.name || '—'}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>{c.orderCount}</td>
                    <td>₹{Number(c.totalSpent || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="customers" />}
          </div>
        </>
      )}
    </div>
  );
}
