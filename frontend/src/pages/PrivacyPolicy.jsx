import { PolicyPage } from '../components/PolicyPage';

export function PrivacyPolicy() {
  return (
    <PolicyPage
      title="Privacy Policy"
      description="How SATVEX collects, uses, and protects your personal information."
      path="/privacy-policy"
    >
      <section>
        <h2>Information We Collect</h2>
        <p>To create your account and process orders, we collect:</p>
        <ul>
          <li>Your mobile number, verified via a one-time password (OTP) — this is how you sign in, we don&apos;t use passwords or require an email address.</li>
          <li>Your name, if you choose to add it to your profile.</li>
          <li>Delivery addresses you save or enter at checkout.</li>
          <li>Your order history, cart, and wishlist.</li>
        </ul>
      </section>

      <section>
        <h2>How We Use It</h2>
        <p>
          We use this information solely to process and deliver your orders, verify your identity at sign-in, provide
          customer support, and communicate with you about your orders. We do not sell your personal information to
          third parties for marketing purposes.
        </p>
      </section>

      <section>
        <h2>Who We Share It With</h2>
        <p>We share only what&apos;s necessary with trusted service providers who help us run SATVEX:</p>
        <ul>
          <li><strong>Shiprocket</strong> — your delivery address and contact number, to ship and track your order.</li>
          <li><strong>PayU</strong> — your name and contact details, to process online payments securely. SATVEX never sees or stores your card/UPI details directly; that's handled entirely by PayU.</li>
          <li><strong>Amazon Web Services (AWS)</strong> — our hosting infrastructure, which securely stores your account and order data.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies & Local Storage</h2>
        <p>
          We use a secure session cookie (and a browser storage fallback) purely to keep you signed in between visits.
          We don&apos;t use third-party advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>Your Choices</h2>
        <p>
          You can view and update your profile and saved addresses any time from <strong>My Account</strong>. To
          request deletion of your account or data, email us and we&apos;ll action it promptly.
        </p>
      </section>

      <section>
        <h2>Contact Us</h2>
        <p>
          Questions about this policy or your data? Email{' '}
          <a href="mailto:satvexproducts.team@gmail.com">satvexproducts.team@gmail.com</a>.
        </p>
      </section>
    </PolicyPage>
  );
}
