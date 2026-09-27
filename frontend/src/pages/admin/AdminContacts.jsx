import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import './Admin.css';

export function AdminContacts() {
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminService
      .contacts()
      .then((data) => setContacts(data.contacts))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!contacts) return <Loader label="Loading messages…" />;
  if (contacts.length === 0) return <EmptyState title="No messages yet" />;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Contact Messages</h1>
      </div>
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
            {contacts.map((c) => (
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
      </div>
    </div>
  );
}
