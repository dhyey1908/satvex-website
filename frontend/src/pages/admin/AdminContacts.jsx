import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { AdminSearchField, SortableTh, ResetFiltersButton, DateFilter, ResultCount } from '../../components/AdminListControls';
import { useAdminList } from '../../hooks/useAdminList';
import { formatDate } from '../../utils/date';
import { ENQUIRY_TYPE_LABELS, ENQUIRY_TYPE_PILL_CLASS } from '../../utils/contactEnquiry';
import './Admin.css';

const PAGE_SIZE = 20;

const LIST_DEFAULTS = {
  sortBy: 'createdAt',
  sortDir: 'desc',
  filters: { enquiryType: '', status: '', dateFrom: '', dateTo: '' },
};

export function AdminContacts() {
  const list = useAdminList({
    fetcher: adminService.contacts,
    resultKey: 'contacts',
    defaults: LIST_DEFAULTS,
    pageSize: PAGE_SIZE,
  });
  const { items: contacts, filters, setFilter } = list;
  const sortProps = { sortBy: list.sortBy, sortDir: list.sortDir, onSort: list.toggleSort };

  return (
    <div>
      <div className="admin-page-header">
        <h1>Contact Messages</h1>
      </div>

      <div className="admin-filters">
        <AdminSearchField
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="Search by name, email, phone, order id, message…"
          label="Search messages"
        />
        <select
          value={filters.enquiryType}
          onChange={(e) => setFilter('enquiryType', e.target.value)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {Object.entries(ENQUIRY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Resolution status">
          <option value="">Open &amp; resolved</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
        <DateFilter label="From" value={filters.dateFrom} max={filters.dateTo} onChange={(v) => setFilter('dateFrom', v)} />
        <DateFilter label="To" value={filters.dateTo} min={filters.dateFrom} onChange={(v) => setFilter('dateTo', v)} />
        <ResetFiltersButton visible={list.hasActiveFilters} onClick={list.reset} />
      </div>

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {!list.error && !contacts && <Loader label="Loading messages…" />}
      {!list.error && contacts?.length === 0 && (
        <EmptyState
          title={list.hasActiveFilters ? 'No messages match these filters' : 'No messages yet'}
          message={list.hasActiveFilters ? 'Try a different search or reset the filters.' : undefined}
        />
      )}

      {!list.error && contacts?.length > 0 && (
        <>
          <ResultCount pagination={list.pagination} loading={list.loading} label="messages" />
          <div className={`admin-table-wrap ${list.loading ? 'is-refreshing' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <SortableTh label="Date" field="createdAt" firstDir="desc" {...sortProps} />
                  <th>Type</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.contactId}>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>
                      <span className={`pill ${ENQUIRY_TYPE_PILL_CLASS[c.enquiryType] || 'pill-inactive'}`}>
                        {ENQUIRY_TYPE_LABELS[c.enquiryType] || 'General Enquiry'}
                      </span>
                    </td>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.message}
                    </td>
                    <td>
                      <span className={`pill ${c.status === 'resolved' ? 'pill-active' : 'pill-warning'}`}>
                        {c.status === 'resolved' ? 'Resolved' : 'Open'}
                      </span>
                    </td>
                    <td>
                      <Link to={`/admin/contacts/${c.contactId}`} className="btn btn-ghost btn-sm">
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.paginationProps && <Pagination {...list.paginationProps} itemLabel="messages" />}
          </div>
        </>
      )}
    </div>
  );
}
