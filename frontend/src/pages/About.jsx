import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Leaf, Infinity as InfinityIcon, Package, Star, Quote } from 'lucide-react';
import { productService } from '../services/productService';
import { useSettings } from '../context/SettingsContext';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { revealOnScroll, staggerContainer, fadeUp } from '../motion';
import './About.css';

const VALUES = [
  { icon: InfinityIcon, title: 'Flexible', text: 'Moves comfortably with your everyday needs.' },
  { icon: Leaf, title: 'Comfortable', text: 'Lightweight designs created for effortless everyday use.' },
  { icon: Package, title: 'Durable', text: 'Made to deliver dependable performance and lasting usability.' },
  { icon: Star, title: 'Stylish', text: 'Modern aesthetics designed for today’s women.' },
];

export function About() {
  useDocumentMeta({
    title: 'About Us',
    description: 'SATVEX creates modern women-focused essentials designed around flexibility, comfort, durability and effortless style.',
    path: '/about',
  });

  const { settings } = useSettings();
  const [fallbackImage, setFallbackImage] = useState(null);

  useEffect(() => {
    if (settings?.aboutImage) return;
    productService
      .list()
      .then((data) => setFallbackImage(data.products?.[0]?.images?.[0] || null))
      .catch(() => {});
  }, [settings?.aboutImage]);

  const heroImage = settings?.aboutImage || fallbackImage;

  return (
    <div className="about-page">
      <section className="section about-hero">
        <div className="container about-hero-grid">
          <div>
            <div className="eyebrow-dot"><span>About Us</span></div>
            <h1 className="text-display-xl">Everyday Essentials, Reimagined.</h1>
            <p className="text-body-lg">
              At SATVEX, we believe everyday products should be comfortable, reliable and
              beautifully designed.
            </p>
            <p>
              Our focus is on creating thoughtfully engineered products that offer flexibility,
              lasting performance and effortless comfort, while complementing the modern lifestyle
              of women.
            </p>
          </div>
          <div className="about-hero-image">
            {heroImage ? <img src={heroImage} alt="Satvex" /> : <ImagePlaceholder />}
          </div>
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
            {VALUES.map((v) => (
              <motion.div key={v.title} className="about-value-card" variants={fadeUp}>
                <div className="about-value-icon"><v.icon size={22} /></div>
                <h3 className="text-title-md">{v.title}</h3>
                <p className="text-body-sm">{v.text}</p>
              </motion.div>
            ))}
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
