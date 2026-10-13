import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { formatDate } from '../../utils/date';
import { ENQUIRY_TYPE_LABELS, ENQUIRY_TYPE_PILL_CLASS } from '../../utils/contactEnquiry';
import './Admin.css';

const PAGE_SIZE = 20;

export function AdminContacts() {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminService
      .contacts()
      .then((data) => setContacts(data.contacts))
      .catch((err) => setError(err.message));
  }, []);

  const visible = useMemo(() => {
    if (!contacts) return null;
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.message?.toLowerCase().includes(term) ||
        c.orderId?.toLowerCase().includes(term) ||
        ENQUIRY_TYPE_LABELS[c.enquiryType]?.toLowerCase().includes(term)
    );
  }, [contacts, search]);

  const { page, setPage, totalPages, pageItems: pageContacts, total: totalVisible, rangeStart, rangeEnd } =
    usePagination(visible, PAGE_SIZE);

  if (error) return <ErrorState message={error} />;
  if (!contacts) return <Loader label="Loading messages…" />;
  if (contacts.length === 0) return <EmptyState title="No messages yet" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Contact Messages</h1>
      </div>

      <form className="admin-filters" onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder="Search by name, email, message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      {visible.length === 0 && <EmptyState title="No messages match your search" />}

      {visible.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Message</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageContacts.map((c) => (
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
                    <Link to={`/admin/contacts/${c.contactId}`} className="btn btn-ghost btn-sm">
                      <Eye size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={totalVisible}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            itemLabel="messages"
          />
        </div>
      )}
    </div>
  );
}
