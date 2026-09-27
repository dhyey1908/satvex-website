import { BoxIcon } from './Icons';

export function EmptyState({ title, message, action, icon: Icon = BoxIcon }) {
  return (
    <div className="state-block">
      <div className="state-icon"><Icon width={26} height={26} /></div>
      <h3 className="text-headline-sm">{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
