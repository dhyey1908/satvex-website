const WIDTH = 640;
const HEIGHT = 140;
const PADDING = 8;

export function TrendChart({ data, formatValue = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = (WIDTH - PADDING * 2) / Math.max(1, data.length - 1);

  const points = data.map((d, i) => {
    const x = PADDING + i * stepX;
    const y = HEIGHT - PADDING - (d.value / max) * (HEIGHT - PADDING * 2);
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1]?.[0] ?? 0},${HEIGHT - PADDING} L${PADDING},${HEIGHT - PADDING} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="trend-chart" preserveAspectRatio="none">
      <path d={areaPath} className="trend-chart-area" />
      <path d={linePath} className="trend-chart-line" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" className="trend-chart-dot">
          <title>
            {data[i].label}: {formatValue(data[i].value)}
          </title>
        </circle>
      ))}
    </svg>
  );
}
