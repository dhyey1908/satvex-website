import { Outlet } from 'react-router-dom';
import { AccountSidebar } from '../components/AccountSidebar';
import './AccountLayout.css';

export function AccountLayout() {
  return (
    <div className="container section account-layout">
      <div className="account-grid">
        <AccountSidebar />
        <div className="account-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
