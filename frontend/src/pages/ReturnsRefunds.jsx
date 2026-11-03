import { Link } from 'react-router-dom';
import { PolicyPage } from '../components/PolicyPage';
import { useSettings } from '../context/SettingsContext';
import { STOREFRONT } from '../config/storefront';

export function ReturnsRefunds() {
  const { settings } = useSettings();
  const { policy } = STOREFRONT;
  const email = settings?.contactEmail;

  return (
    <PolicyPage
      title="Returns & Refunds"
      description={`SATVEX returns and refunds policy: report a damaged or wrong item within ${policy.reportWithin} of delivery for a replacement or refund.`}
      path="/returns-refunds"
    >
      <section>
        <h2>What&apos;s Covered</h2>
        <ul>
          <li>A clip that arrives <strong>damaged</strong>.</li>
          <li>A clip that is <strong>not what you ordered</strong> (wrong product).</li>
          <li>We give you a <strong>replacement or a refund</strong>.</li>
          <li>If we ask you to send the item back, <strong>we pay the return shipping</strong>.</li>
        </ul>
      </section>

      <section>
        <h2>How to Request</h2>
        <ol>
          <li>
            <strong>Tell us within {policy.reportWithin} of delivery.</strong>{' '}
            {email ? <>Email <a href={`mailto:${email}`}>{email}</a> or use</> : <>Use</>} our <Link to="/contact">Contact Us</Link> page.
            Include your <strong>order number</strong>.
          </li>
          <li>
            <strong>Send photos and a short video</strong> of the clip and its packaging showing the damage or mix-up.
          </li>
          <li>
            <strong>We reply within {policy.replyWithin}</strong> and arrange your replacement or refund.
          </li>
        </ol>
        <p>Reports made after {policy.reportWithin}, or without photo/video proof, can&apos;t be processed.</p>
      </section>

      <section>
        <h2>How Refunds Work</h2>
        <ul>
          <li>We contact you on your <strong>registered mobile number</strong> to confirm the details.</li>
          <li>We send the refund to your <strong>UPI ID or bank account</strong>.</li>
          <li>This is the same for online (prepaid) and Cash on Delivery orders.</li>
        </ul>
      </section>

      <section>
        <h2>What&apos;s Not Covered</h2>
        <ul>
          <li>Change of mind, or a wrong colour chosen by mistake.</li>
          <li>Clips that have been <strong>worn or used</strong>.</li>
          <li>Damage caused by misuse after delivery.</li>
        </ul>
      </section>

      <section>
        <h2>Cancelling an Order</h2>
        <ul>
          <li>You can cancel <strong>before it ships</strong>: open <strong>My Account → My Orders</strong> and cancel while the order shows Pending or Confirmed.</li>
          <li>Once it has shipped, it can&apos;t be cancelled.</li>
          <li>If you already paid online, we refund you as described above.</li>
        </ul>
      </section>

      <section>
        <h2>Questions?</h2>
        <p>
          {email ? <>Email <a href={`mailto:${email}`}>{email}</a> or use </> : <>Use </>}
          our <Link to="/contact">Contact Us</Link> page.
        </p>
      </section>
    </PolicyPage>
  );
}
