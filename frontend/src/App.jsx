import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { AccountLayout } from './layouts/AccountLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { ScrollToTop } from './components/ScrollToTop';
import { useSettings } from './context/SettingsContext';

import { Home } from './pages/Home';
import { Shop } from './pages/Shop';
import { ProductDetail } from './pages/ProductDetail';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { ShippingPolicy } from './pages/ShippingPolicy';
import { ReturnsRefunds } from './pages/ReturnsRefunds';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsConditions } from './pages/TermsConditions';
import { Login } from './pages/Login';
import { Wishlist } from './pages/Wishlist';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderConfirmation } from './pages/OrderConfirmation';
import { NotFound } from './pages/NotFound';

import { AccountOverview } from './pages/account/AccountOverview';
import { AccountOrders } from './pages/account/AccountOrders';
import { AccountOrderDetail } from './pages/account/AccountOrderDetail';
import { AccountAddresses } from './pages/account/AccountAddresses';
import { AccountProfile } from './pages/account/AccountProfile';

import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminProductForm } from './pages/admin/AdminProductForm';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminOrderDetail } from './pages/admin/AdminOrderDetail';
import { AdminShipmentIssues } from './pages/admin/AdminShipmentIssues';
import { AdminCustomers } from './pages/admin/AdminCustomers';
import { AdminContacts } from './pages/admin/AdminContacts';
import { AdminContactDetail } from './pages/admin/AdminContactDetail';
import { AdminCoupons } from './pages/admin/AdminCoupons';
import { AdminReviews } from './pages/admin/AdminReviews';
import { AdminBanners } from './pages/admin/AdminBanners';
import { AdminAnnouncements } from './pages/admin/AdminAnnouncements';
import { AdminSettings } from './pages/admin/AdminSettings';

export default function App() {
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings?.logoUrl) return;
    let link = document.head.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.logoUrl;
  }, [settings?.logoUrl]);

  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/shipping-policy" element={<ShippingPolicy />} />
        <Route path="/returns-refunds" element={<ReturnsRefunds />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-conditions" element={<TermsConditions />} />
        {/* /login stays mounted but unlinked from customer nav — it's now
            admin's own email+password entry point; customers authenticate
            exclusively via the phone+OTP popup (AuthGateContext). */}
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />

          {/* Old routes redirect to their /account/* equivalents so no existing link breaks. */}
          <Route path="/profile" element={<Navigate to="/account/profile" replace />} />
          <Route path="/orders" element={<Navigate to="/account/orders" replace />} />
          <Route path="/orders/:id" element={<OrderRedirect />} />

          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<AccountOverview />} />
            <Route path="orders" element={<AccountOrders />} />
            <Route path="orders/:id" element={<AccountOrderDetail />} />
            <Route path="addresses" element={<AccountAddresses />} />
            <Route path="profile" element={<AccountProfile />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductForm />} />
          <Route path="products/:id" element={<AdminProductForm />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="shipment-issues" element={<AdminShipmentIssues />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="contacts" element={<AdminContacts />} />
          <Route path="contacts/:id" element={<AdminContactDetail />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="banners" element={<AdminBanners />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>
      </Routes>
    </>
  );
}

function OrderRedirect() {
  const { id } = useParams();
  return <Navigate to={`/account/orders/${id}`} replace />;
}
