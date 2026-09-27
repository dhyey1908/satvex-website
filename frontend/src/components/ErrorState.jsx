import { AlertCircle } from 'lucide-react';

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  return (
    <div className="state-block state-block-error">
      <div className="state-icon state-icon-error"><AlertCircle size={26} /></div>
      <h3 className="text-headline-sm">We hit a snag</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-outline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
