import { PolicyPage } from '../components/PolicyPage';

export function ReturnsRefunds() {
  return (
    <PolicyPage
      title="Returns & Refunds"
      description="SATVEX returns and refunds policy — how to report a damaged or incorrect order within 48 hours of delivery."
      path="/returns-refunds"
    >
      <section>
        <h2>What&apos;s Covered</h2>
        <p>
          We accept returns and replacements only for orders received <strong>damaged</strong> or where you received
          a <strong>different product</strong> than what you ordered. We&apos;re unable to offer returns or exchanges
          for a simple change of mind, incorrect size/color selection, or other reasons once an order has been
          correctly delivered as ordered.
        </p>
      </section>

      <section>
        <h2>How to Report an Issue</h2>
        <p>If your order arrives damaged or incorrect, please let us know within <strong>48 hours of delivery</strong>:</p>
        <ul>
          <li>
            Email <a href="mailto:satvexproducts.team@gmail.com">satvexproducts.team@gmail.com</a> with your order
            number.
          </li>
          <li>Include clear photos and a short video of the product and its packaging showing the damage or mismatch.</li>
          <li>Reports made after 48 hours, or without photo/video proof, unfortunately cannot be processed.</li>
        </ul>
      </section>

      <section>
        <h2>What Happens Next</h2>
        <p>
          Once we verify your report, we&apos;ll arrange a replacement or a refund, whichever is appropriate — we&apos;ll
          confirm the outcome with you directly over email before proceeding.
        </p>
      </section>

      <section>
        <h2>Questions?</h2>
        <p>
          Reach us any time at <a href="mailto:satvexproducts.team@gmail.com">satvexproducts.team@gmail.com</a> or
          via our <a href="/contact">Contact Us</a> page.
        </p>
      </section>
    </PolicyPage>
  );
}
