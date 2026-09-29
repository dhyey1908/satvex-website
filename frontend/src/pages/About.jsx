import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, Infinity as InfinityIcon, Package, Star, Quote } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { revealOnScroll, staggerContainer, fadeUp } from '../motion';
import './About.css';

const VALUE_ICONS = [InfinityIcon, Leaf, Package, Star];
const DEFAULT_VALUES = [
  { title: 'Flexible', description: 'Moves comfortably with your everyday needs.' },
  { title: 'Comfortable', description: 'Lightweight designs created for effortless everyday use.' },
  { title: 'Durable', description: 'Made to deliver dependable performance and lasting usability.' },
  { title: 'Stylish', description: 'Modern aesthetics designed for today’s women.' },
];

export function About() {
  useDocumentMeta({
    title: 'About Us',
    description: 'SATVEX creates modern women-focused essentials designed around flexibility, comfort, durability and effortless style.',
    path: '/about',
  });

  const { settings } = useSettings();

  return (
    <div className="about-page">
      <section className="section about-hero">
        <div className="container about-hero-inner">
          <div className="eyebrow-dot"><span>About Us</span></div>
          <h1 className="text-display-xl">Everyday Essentials, Reimagined.</h1>
          <p className="text-body-lg">
           SATVEX creates modern essentials designed around comfort, flexibility, durability, and effortless style. Thoughtfully made for everyday life, every piece combines practical design with refined details.
          </p>
          <p>
            We believe the things women use every day should feel as good as they look — simple, dependable, comfortable, and beautifully considered.
          </p>
        </div>
      </section>

      <section className="section about-values">
        <div className="container">
          <div className="eyebrow-dot"><span>Why Satvex</span></div>
          <h2 className="text-headline-lg">Flexible. Comfortable. Durable. Stylish.</h2>
          <motion.div
            className="about-values-grid"
            variants={staggerContainer(0.08)}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-80px' }}
          >
            {(settings?.whyPillars || DEFAULT_VALUES).map((v, i) => {
              const Icon = VALUE_ICONS[i];
              return (
                <motion.div key={v.title} className="about-value-card" variants={fadeUp}>
                  <div className="about-value-icon"><Icon size={22} /></div>
                  <h3 className="text-title-md">{v.title}</h3>
                  <p className="text-body-sm">{v.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="section about-origin">
        <div className="container">
          <motion.div
            className="about-origin-banner"
            initial={revealOnScroll.initial}
            whileInView={revealOnScroll.whileInView}
            viewport={{ once: true, margin: '-80px' }}
          >
            <Quote size={28} fill="currentColor" />
            <blockquote className="text-headline-lg">
              Flexible. Comfortable. Durable. Distinctly SATVEX.
            </blockquote>
            <p className="about-origin-note">
              Every Satvex piece is designed and finished with an obsessive attention to detail —
              because everyday essentials deserve the same care as anything else you wear every day.
              Designed in India.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="section about-cta">
        <div className="container about-cta-inner">
          <h2 className="text-headline-lg">Ready to find your color?</h2>
          <Link to="/shop" className="btn btn-primary">
            Shop the Collection
          </Link>
        </div>
      </section>
    </div>
  );
}
