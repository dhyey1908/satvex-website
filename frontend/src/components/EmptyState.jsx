import { PackageOpen } from 'lucide-react';

export function EmptyState({ title, message, action, icon: Icon = PackageOpen }) {
  return (
    <div className="state-block">
      <div className="state-icon"><Icon size={26} /></div>
      <h3 className="text-headline-sm">{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
