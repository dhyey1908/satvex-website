import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { orderService } from '../../services/orderService';
import { addressService } from '../../services/addressService';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import './Account.css';

export function AccountOverview() {
  useDocumentMeta({ title: 'My Account', path: '/account' });

  const { user } = useAuth();
  const { itemCount: wishlistCount } = useWishlist();
  const [orderCount, setOrderCount] = useState(null);
  const [addressCount, setAddressCount] = useState(null);

  useEffect(() => {
    orderService.list().then((data) => setOrderCount(data.orders.length)).catch(() => setOrderCount(0));
    addressService.list().then((data) => setAddressCount(data.addresses.length)).catch(() => setAddressCount(0));
  }, []);

  return (
    <div>
      <div className="eyebrow-dot"><span>My Account</span></div>
      <h1 className="text-headline-lg">Welcome back, {user?.name?.split(' ')[0]}</h1>
      <p className="account-subtitle">Manage your account, orders and saved information.</p>

      <div className="account-profile-card">
        <div>
          <p className="account-profile-label">Name</p>
          <p className="account-profile-value">{user?.name}</p>
        </div>
        <div>
          <p className="account-profile-label">Email</p>
          <p className="account-profile-value">{user?.email}</p>
        </div>
        <div>
          <p className="account-profile-label">Phone</p>
          <p className="account-profile-value">{user?.phone || '—'}</p>
        </div>
      </div>

      <div className="account-stat-grid">
        <div className="account-stat-tile">
          <div className="account-stat-value">{orderCount ?? '—'}</div>
          <div className="account-stat-label">Total Orders</div>
        </div>
        <div className="account-stat-tile">
          <div className="account-stat-value">{wishlistCount}</div>
          <div className="account-stat-label">Wishlist Items</div>
        </div>
        <div className="account-stat-tile">
          <div className="account-stat-value">{addressCount ?? '—'}</div>
          <div className="account-stat-label">Saved Addresses</div>
        </div>
      </div>

      <h3 className="account-section-title">Quick Actions</h3>
      <div className="account-quick-actions">
        <Link to="/account/orders" className="account-quick-action">View Orders</Link>
        <Link to="/account/addresses" className="account-quick-action">Manage Addresses</Link>
        <Link to="/wishlist" className="account-quick-action">Wishlist</Link>
        <Link to="/account/profile" className="account-quick-action">Edit Profile</Link>
      </div>
    </div>
  );
}
