import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettings } from '../context/SettingsContext';
import { STOREFRONT } from '../config/storefront';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { revealOnScroll } from '../motion';
import './About.css';

const CHECKS = [
  ['Spring tension', 'It opens and closes firmly, and holds.'],
  ['Teeth', 'Smooth and rounded, with no rough spots.'],
  ['Body', 'No cracks and no sharp edges.'],
  ['Colour', 'It matches the colour you chose.'],
  ['Packing', 'Packed by hand before it ships.'],
];

export function About() {
  useDocumentMeta({
    title: 'About Us',
    description: 'SATVEX makes premium everyday claw clips: a sturdy metal spring, a flexible body that bends instead of snapping, and every clip checked by hand. Based in Rajkot, Gujarat.',
    path: '/about',
  });

  const { settings } = useSettings();
  const { business, policy } = STOREFRONT;

  return (
    <div className="about-page">
      <section className="section about-hero">
        <div className="container about-hero-inner">
          <div className="eyebrow-dot"><span>About Us</span></div>
          <h1 className="text-display-xl">Pretty clips that actually hold.</h1>
          <p className="text-body-lg">
            Satvex makes premium everyday claw clips. Sturdy where it matters, soft where it touches your hair, and
            checked by hand before it reaches you.
          </p>
        </div>
      </section>

      <section className="section about-block">
        <div className="container about-text">
          <h2 className="text-headline-lg">Why we started</h2>
          <p>Most clips make you choose.</p>
          <ul>
            <li>The <strong>pretty</strong> ones snap, slip or pinch.</li>
            <li>The <strong>strong</strong> ones look plain.</li>
          </ul>
          <p>
            We wanted one clip that does both: a <strong>sturdy metal spring</strong>, a <strong>flexible body that bends
            instead of snapping</strong>, and <strong>rounded, interlocking teeth</strong> that hold thick hair without
            digging in. The design is bend-tested and drop-tested. Satvex is based in Rajkot, Gujarat.
          </p>
        </div>
      </section>

      <section className="section about-values">
        <div className="container about-text">
          <h2 className="text-headline-lg">How we check every clip</h2>
          <ol className="about-checks">
            {CHECKS.map(([title, text]) => (
              <li key={title}><strong>{title}.</strong> {text}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section about-block">
        <div className="container about-text">
          <h2 className="text-headline-lg">Why buy direct from us</h2>
          <ul>
            <li>We sell <strong>directly to you</strong>. No marketplace in between.</li>
            <li><strong>Real people</strong> answer your messages, within {policy.replyWithin}.</li>
            <li>Pay online{settings?.cod?.enabled !== false && <>, or choose <strong>Cash on Delivery</strong></>}.</li>
            <li>Clip arrived damaged? We <strong>replace it or refund you</strong>.</li>
          </ul>
        </div>
      </section>

      <section className="section about-values">
        <div className="container about-text">
          <h2 className="text-headline-lg">Business details</h2>
          <dl className="about-details">
            <dt>Business</dt>
            <dd>{business.name}</dd>
            <dt>Address</dt>
            <dd>{business.address}</dd>
            {settings?.contactEmail && (
              <>
                <dt>Email</dt>
                <dd><a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></dd>
              </>
            )}
            {settings?.contactPhone && (
              <>
                <dt>Phone</dt>
                <dd><a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a></dd>
              </>
            )}
            <dt>Complaints</dt>
            <dd>Write to the email above, or use our <Link to="/contact">Contact page</Link>. We reply within {policy.replyWithin}.</dd>
          </dl>
        </div>
      </section>

      <section className="section about-cta">
        <motion.div
          className="container about-cta-inner"
          initial={revealOnScroll.initial}
          whileInView={revealOnScroll.whileInView}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-headline-lg">Ready to find your colour?</h2>
          <Link to="/shop" className="btn btn-primary">
            Shop the Collection
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
