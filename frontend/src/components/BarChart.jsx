const WIDTH = 640;
const HEIGHT = 170;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

// Evenly-spaced x labels so a 30/90-day series doesn't print 90 overlapping
// dates — first, last and a handful in between.
function labelIndexes(count, maxLabels = 6) {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const step = (count - 1) / (maxLabels - 1);
  return new Set(Array.from({ length: maxLabels }, (_, i) => Math.round(i * step)));
}

/**
 * Vertical bars that support NEGATIVE values (profit can be below zero) —
 * TrendChart assumes non-negative data, so profit uses this instead.
 * data: [{ label, value }]
 */
export function BarChart({ data, formatValue = (v) => v }) {
  if (!data || data.length === 0) return null;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNegative = data.some((d) => d.value < 0);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  // Zero line sits at the bottom of the plot, or mid-plot if any bar is negative.
  const zeroY = PAD_TOP + (hasNegative ? plotHeight / 2 : plotHeight);
  const scale = (hasNegative ? plotHeight / 2 : plotHeight) / maxAbs;
  const slot = (WIDTH - PAD_X * 2) / data.length;
  const barWidth = Math.max(2, Math.min(28, slot * 0.7));
  const showLabel = labelIndexes(data.length);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="bar-chart" role="img" aria-label="Bar chart">
      <line x1={PAD_X} x2={WIDTH - PAD_X} y1={zeroY} y2={zeroY} className="bar-chart-axis" />
      {data.map((d, i) => {
        const h = Math.abs(d.value) * scale;
        const x = PAD_X + i * slot + (slot - barWidth) / 2;
        const y = d.value >= 0 ? zeroY - h : zeroY;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(d.value === 0 ? 0 : 1, h)}
              rx="2"
              className={d.value < 0 ? 'bar-chart-bar bar-chart-bar-negative' : 'bar-chart-bar'}
            >
              <title>
                {d.label}: {formatValue(d.value)}
              </title>
            </rect>
            {showLabel.has(i) && (
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="bar-chart-label">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Horizontal share bars for comparing a few categories (e.g. COD vs prepaid).
 * rows: [{ label, value, display }]
 */
export function ShareBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="share-bars">
      {rows.map((r) => (
        <div key={r.label} className="share-bars-row">
          <div className="share-bars-head">
            <span>{r.label}</span>
            <strong>{r.display}</strong>
          </div>
          <div className="share-bars-track">
            <div className="share-bars-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
