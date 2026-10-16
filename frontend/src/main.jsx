import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { AuthProvider } from './context/AuthContext';
import { AuthGateProvider } from './context/AuthGateContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { SettingsProvider } from './context/SettingsContext';
import { ActionLoaderProvider } from './context/ActionLoaderContext';
import './styles/global.css';

// Browsers (mobile Safari/Chrome especially) try to restore the page's
// previous scroll position after a reload — and that restoration can win
// the race against ScrollToTop's own reset-on-mount effect, landing a
// refreshed page wherever it was last scrolled instead of the top. Turning
// this off hands scroll position entirely to the app (ScrollToTop below,
// plus ProductDetail's own #reviews-hash handling), which is the only thing
// that should be deciding it.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <SettingsProvider>
            <ActionLoaderProvider>
            <AuthProvider>
              <AuthGateProvider>
                <CartProvider>
                  <WishlistProvider>
                    <App />
                  </WishlistProvider>
                </CartProvider>
              </AuthGateProvider>
            </AuthProvider>
            </ActionLoaderProvider>
          </SettingsProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
