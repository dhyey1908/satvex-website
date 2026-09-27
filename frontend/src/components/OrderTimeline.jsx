import './OrderTimeline.css';

const STEPS = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered'];

export function OrderTimeline({ status }) {
  if (status === 'Cancelled') {
    return (
      <div className="order-timeline order-timeline-cancelled">
        <span className="order-timeline-dot" />
        <span>This order was cancelled.</span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="order-timeline">
      {STEPS.map((step, i) => (
        <div key={step} className={`order-timeline-step ${i <= currentIndex ? 'done' : ''}`}>
          <span className="order-timeline-dot" />
          <span className="order-timeline-label">{step}</span>
          {i < STEPS.length - 1 && <span className="order-timeline-line" />}
        </div>
      ))}
    </div>
  );
}
