import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
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
        c.message?.toLowerCase().includes(term)
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
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {pageContacts.map((c) => (
                <tr key={c.contactId}>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 400 }}>{c.message}</td>
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
