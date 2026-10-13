import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { X, ArrowLeft } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../utils/date';
import {
  enquiryTypeLabel,
  enquiryTypePillClass,
  RETURN_REASON_LABELS,
  RETURN_RESOLUTION_LABELS,
  PAYMENT_METHOD_LABELS,
  isVideoUrl,
} from '../../utils/contactEnquiry';
import './Admin.css';

// No dedicated GET-by-id endpoint — contact volume is explicitly treated as
// low elsewhere (see contactService.js's own comment on listContacts' Scan),
// so this reuses the existing full-list admin endpoint and finds the one
// record client-side, same as the list page already does for search.
export function AdminContactDetail() {
  const { id } = useParams();
  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    adminService
      .contacts()
      .then((data) => setContacts(data.contacts))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!contacts) return <Loader label="Loading enquiry…" />;

  const contact = contacts.find((c) => c.contactId === id);
  if (!contact) return <ErrorState message="Enquiry not found." />;

  const attachments = contact.attachments || [];

  return (
    <div>
      <div className="admin-page-header">
        <h1>
          <Link to="/admin/contacts" className="btn btn-ghost btn-sm" style={{ marginRight: 8 }}>
            <ArrowLeft size={14} /> Back
          </Link>
          Enquiry Details
        </h1>
      </div>

      <div className="admin-form-section">
        <h3>
          <span className={`pill ${enquiryTypePillClass(contact.enquiryType)}`}>
            {enquiryTypeLabel(contact.enquiryType)}
          </span>
        </h3>
        <p>Received {formatDateTime(contact.createdAt)}</p>
      </div>

      <div className="admin-form-section">
        <h3>Contact</h3>
        <p>{contact.name}</p>
        <p>{contact.email ? `${contact.email} · ` : ''}{contact.phone || '—'}</p>
      </div>

      {(contact.orderId || contact.returnReason || contact.returnResolution || contact.paymentMethod || contact.transactionRef || contact.cancelReason) && (
        <div className="admin-form-section">
          <h3>Enquiry Details</h3>
          {contact.orderId && <p><strong>Order ID:</strong> {contact.orderId}</p>}
          {contact.returnReason && (
            <p><strong>Reason:</strong> {RETURN_REASON_LABELS[contact.returnReason] || contact.returnReason}</p>
          )}
          {contact.returnResolution && (
            <p><strong>Preferred Resolution:</strong> {RETURN_RESOLUTION_LABELS[contact.returnResolution] || contact.returnResolution}</p>
          )}
          {contact.paymentMethod && (
            <p><strong>Payment Method:</strong> {PAYMENT_METHOD_LABELS[contact.paymentMethod] || contact.paymentMethod}</p>
          )}
          {contact.transactionRef && <p><strong>Transaction Reference:</strong> {contact.transactionRef}</p>}
          {contact.cancelReason && <p><strong>Cancellation Reason:</strong> {contact.cancelReason}</p>}
        </div>
      )}

      <div className="admin-form-section">
        <h3>Message</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{contact.message}</p>
      </div>

      {attachments.length > 0 && (
        <div className="admin-form-section">
          <h3>Attachments ({attachments.length})</h3>
          <div className="admin-attachment-grid">
            {attachments.map((url) => (
              <button
                key={url}
                type="button"
                className="admin-attachment-item"
                onClick={() => setLightbox(url)}
                aria-label="View full-size attachment"
              >
                {isVideoUrl(url) ? <video src={url} muted playsInline /> : <img src={url} alt="" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div className="admin-attachment-lightbox" onClick={() => setLightbox(null)}>
          <button type="button" className="admin-attachment-lightbox-close" aria-label="Close">
            <X size={22} />
          </button>
          {isVideoUrl(lightbox) ? (
            <video src={lightbox} controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  );
}
