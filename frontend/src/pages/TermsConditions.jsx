import { PolicyPage } from '../components/PolicyPage';

export function TermsConditions() {
  return (
    <PolicyPage
      title="Terms & Conditions"
      description="The terms and conditions governing your use of the SATVEX website and purchases."
      path="/terms-conditions"
    >
      <section>
        <h2>About These Terms</h2>
        <p>
          These terms govern your use of the SATVEX website and any purchase you make through it. By using our site
          or placing an order, you agree to these terms. SATVEX is based in Gujarat, India.
        </p>
      </section>

      <section>
        <h2>Products & Pricing</h2>
        <p>
          We make every effort to display product details and pricing accurately. Prices are listed in Indian Rupees
          (₹) and are subject to change without notice. Product availability isn&apos;t guaranteed until your order is
          confirmed.
        </p>
      </section>

      <section>
        <h2>Orders & Payment</h2>
        <p>
          We accept payment via UPI/Cards (processed securely through PayU) and Cash on Delivery, where available.
          SATVEX reserves the right to refuse or cancel any order, including in cases of suspected fraud, pricing
          errors, or stock unavailability — in which case any payment already made will be refunded.
        </p>
      </section>

      <section>
        <h2>Shipping & Returns</h2>
        <p>
          Shipping timelines and charges are detailed in our <a href="/shipping-policy">Shipping & Delivery</a> policy.
          Our return and refund terms are detailed in our <a href="/returns-refunds">Returns & Refunds</a> policy.
        </p>
      </section>

      <section>
        <h2>Intellectual Property</h2>
        <p>
          The SATVEX name, logo, and all content on this website are the property of SATVEX and may not be used,
          copied, or reproduced without our written permission.
        </p>
      </section>

      <section>
        <h2>Limitation of Liability</h2>
        <p>
          SATVEX is not liable for indirect or incidental damages arising from the use of our website or products,
          to the fullest extent permitted by law.
        </p>
      </section>

      <section>
        <h2>Governing Law</h2>
        <p>
          These terms are governed by the laws of India. Any disputes are subject to the exclusive jurisdiction of
          the courts of Gujarat, India.
        </p>
      </section>

      <section>
        <h2>Contact Us</h2>
        <p>
          Questions about these terms? Email{' '}
          <a href="mailto:satvexproducts.team@gmail.com">satvexproducts.team@gmail.com</a>.
        </p>
      </section>
    </PolicyPage>
  );
}
