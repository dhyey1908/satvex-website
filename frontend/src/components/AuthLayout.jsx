import { useEffect, useState } from 'react';
import { productService } from '../services/productService';
import './AuthLayout.css';

export function AuthLayout({ children }) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    productService
      .list()
      .then((data) => {
        const first = data.products?.[0];
        setImage(first?.images?.[0] || null);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="auth-layout">
      <div className="auth-visual">
        {image && <img src={image} alt="Satvex" />}
        <div className="auth-visual-overlay" />
        <div className="auth-visual-content">
          <div className="eyebrow-dot"><span>Satvex Collection</span></div>
          <blockquote className="text-headline-md">Designed for Her. Made to Move.</blockquote>
        </div>
      </div>
      <div className="auth-panel">{children}</div>
    </div>
  );
}
