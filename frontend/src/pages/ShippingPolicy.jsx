import { Link } from 'react-router-dom';
import { PolicyPage } from '../components/PolicyPage';
import { useSettings } from '../context/SettingsContext';
import { STOREFRONT } from '../config/storefront';

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function ShippingPolicy() {
  const { settings } = useSettings();
  const { policy } = STOREFRONT;
  const email = settings?.contactEmail;
  const freeFrom = Number(settings?.shipping?.freeThreshold);
  const codOn = settings?.cod?.enabled !== false;
  const codFee = Number(settings?.cod?.charge);

  return (
    <PolicyPage
      title="Shipping & Delivery"
      description="SATVEX shipping and delivery policy: dispatch time, delivery dates, shipping charges, Cash on Delivery fee and order tracking."
      path="/shipping-policy"
    >
      <section>
        <h2>Order Processing</h2>
        <ul>
          <li>Orders ship within <strong>{policy.dispatch}</strong>, <strong>7 days a week</strong>.</li>
          <li>You get an order confirmation as soon as you place your order.</li>
          {codOn && <li>For <strong>Cash on Delivery</strong>, we may call you to confirm your order and address before it ships.</li>}
        </ul>
      </section>

      <section>
        <h2>Delivery Time</h2>
        <ul>
          <li>Delivery time depends on your pincode. Enter it on the product page or at checkout to see your <strong>delivery date</strong>.</li>
          <li>The date is an <strong>estimate</strong> from our courier partner. Weather, strikes and festivals can cause delays.</li>
          <li>We deliver across <strong>India only</strong>. If your pincode isn&apos;t serviceable, checkout tells you before you pay.</li>
        </ul>
      </section>

      <section>
        <h2>Shipping Charges</h2>
        <ul>
          {freeFrom > 0 && <li><strong>Free shipping</strong> on orders of {rupees(freeFrom)} and above.</li>}
          <li>Below that, the shipping charge for your pincode is shown before you pay.</li>
          {codOn && (
            <li>
              <strong>Cash on Delivery</strong> adds a {codFee > 0 ? <strong>{rupees(codFee)} COD fee</strong> : 'small COD fee'}, shown at checkout. Pay online and you don&apos;t pay it.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2>Tracking Your Order</h2>
        <ul>
          <li>Once your order ships, open <strong>My Account → My Orders</strong>.</li>
          <li>Tap <strong>Track your shipment</strong> to see where your parcel is.</li>
        </ul>
      </section>

      <section>
        <h2>Delayed, Wrong Address or Nobody Home?</h2>
        <ul>
          <li><strong>Delayed:</strong> if your delivery date has passed, contact us with your order number.</li>
          <li><strong>Wrong address:</strong> tell us as soon as you notice, <strong>before it ships</strong>. Once it has shipped, changing it is usually not possible.</li>
          <li><strong>Nobody home:</strong> the courier will normally try again. If delivery fails, contact us and we&apos;ll help.</li>
        </ul>
      </section>

      <section>
        <h2>Delivery Partners</h2>
        <p>
          Orders are shipped through Shiprocket with trusted courier partners, chosen automatically to get your order
          to you reliably.
        </p>
      </section>

      <section>
        <h2>Questions?</h2>
        <p>
          {email ? <>Email <a href={`mailto:${email}`}>{email}</a> or use </> : <>Use </>}
          our <Link to="/contact">Contact Us</Link> page. We reply within {policy.replyWithin}.
        </p>
      </section>
    </PolicyPage>
  );
}
