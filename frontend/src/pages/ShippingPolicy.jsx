import { PolicyPage } from '../components/PolicyPage';

export function ShippingPolicy() {
  return (
    <PolicyPage
      title="Shipping & Delivery"
      description="SATVEX shipping and delivery policy — dispatch times, delivery areas, shipping charges, and order tracking."
      path="/shipping-policy"
    >
      <section>
        <h2>Order Processing</h2>
        <p>
          Once your order is placed and payment is confirmed, we dispatch it within <strong>1–2 business days</strong>.
          You&apos;ll receive an order confirmation immediately, and tracking details once your order ships — both
          visible any time under <strong>My Account → My Orders</strong>.
        </p>
      </section>

      <section>
        <h2>Delivery Areas</h2>
        <p>
          We currently deliver across <strong>India</strong>. We&apos;re actively working on expanding delivery
          to more states — if your pincode isn&apos;t serviceable yet, it will be flagged at checkout before you pay.
        </p>
      </section>

      <section>
        <h2>Shipping Charges</h2>
        <ul>
          <li>Free shipping on qualifying orders above the threshold shown at checkout.</li>
          <li>Below that, a shipping charge is calculated and shown clearly before you place your order.</li>
          <li>Cash on Delivery orders may include a small additional COD handling charge, also shown upfront at checkout.</li>
        </ul>
      </section>

      <section>
        <h2>Delivery Partners</h2>
        <p>
          Orders are shipped via our trusted courier partners through Shiprocket, chosen automatically to get your
          order to you reliably and on time.
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
