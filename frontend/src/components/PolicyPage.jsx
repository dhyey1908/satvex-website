import { PageHeader } from './PageHeader';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import './PolicyPage.css';

// Shared layout for all legal/policy pages (Shipping & Delivery, Returns &
// Refunds, Privacy Policy, Terms & Conditions) so they read as one
// consistent family rather than four separately-designed pages.
export function PolicyPage({ title, description, path, updatedLabel = 'Last updated: October 2026', children }) {
  useDocumentMeta({ title, description, path });

  return (
    <div className="container section policy-page">
      <PageHeader eyebrow="Policies" title={title} />
      <p className="policy-updated">{updatedLabel}</p>
      <div className="policy-body">{children}</div>
    </div>
  );
}
