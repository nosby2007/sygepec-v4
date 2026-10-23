// Dependency-free SVG charts. Server-safe (no hooks); entrance animations are pure CSS
// so they respect the strict CSP and `prefers-reduced-motion`.

export const PALETTE = {
  blue: "#1e63d6",
  teal: "#14b8a6",
  gold: "#f5b841",
  navy: "#123c69",
  violet: "#7c3aed",
  rose: "#e11d48",
  green: "#16a34a",
  orange: "#ea580c",
  slate: "#94a3b8",
};
export const SERIES = [PALETTE.blue, PALETTE.teal, PALETTE.gold, PALETTE.violet, PALETTE.orange, PALETTE.rose, PALETTE.navy, PALETTE.green];

const hash = (value) => {
  let h = 0;
  const s = JSON.stringify(value);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

const compact = (n) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : String(Math.round(n));

// Rounds an axis maximum up so four gridline intervals land on readable values.
function niceMax(value) {
  if (!(value > 0)) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return step * [1, 2, 4, 6, 8, 12, 16, 20].find((m) => m * step >= value);
}

// Catmull-Rom spline converted to cubic Béziers for a smooth line through every point.
function smoothPath(points) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    // Clamp control points between the segment's endpoints so the curve never overshoots (e.g. below zero).
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const clamp = (y) => Math.min(hi, Math.max(lo, y));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
          {item.value != null && <b>{item.value}</b>}
        </span>
      ))}
    </div>
  );
}

export function AreaChart({ data, height = 220, color = PALETTE.blue, format = compact, showDots = true, label = "Trend" }) {
  const W = 600, H = height, padX = 34, padTop = 16, padBottom = 28;
  const values = data.map((d) => d.value);
  const max = niceMax(Math.max(...values, 0) * 1.08);
  const step = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [padX + i * step, padTop + (1 - d.value / max) * (H - padTop - padBottom)]);
  const line = smoothPath(pts);
  const base = H - padBottom;
  const area = pts.length ? `${line} L${pts.at(-1)[0]},${base} L${pts[0][0]},${base} Z` : "";
  const id = `ac-${hash([data, color])}`;
  const grid = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg className="chart chart-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((g) => {
        const y = padTop + g * (H - padTop - padBottom);
        return (
          <g key={g}>
            <line x1={padX} x2={W - padX} y1={y} y2={y} className="chart-grid" />
            <text x={padX - 8} y={y + 4} className="chart-axis" textAnchor="end">{format(max * (1 - g))}</text>
          </g>
        );
      })}
      <path d={area} fill={`url(#${id})`} className="chart-fill" />
      <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" className="chart-line" pathLength="1" />
      {showDots && pts.map(([x, y], i) => (
        <g key={i} className="chart-dot">
          <circle cx={x} cy={y} r="10" fill="transparent" />
          <circle cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
          <title>{`${data[i].label}: ${format(data[i].value)}`}</title>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={d.label + i} x={padX + i * step} y={H - 8} className="chart-axis" textAnchor="middle">{d.label}</text>
      ))}
    </svg>
  );
}

export function BarChart({ data, series, height = 230, format = compact, label = "Comparison" }) {
  const W = 600, H = height, padX = 34, padTop = 14, padBottom = 28;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)) * 1.05);
  const groupW = (W - padX * 2) / Math.max(1, data.length);
  const barW = Math.min(26, (groupW * 0.7) / series.length);
  const plotH = H - padTop - padBottom;
  return (
    <svg className="chart chart-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = padTop + g * plotH;
        return (
          <g key={g}>
            <line x1={padX} x2={W - padX} y1={y} y2={y} className="chart-grid" />
            <text x={padX - 8} y={y + 4} className="chart-axis" textAnchor="end">{format(max * (1 - g))}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const gx = padX + i * groupW + (groupW - barW * series.length - 4 * (series.length - 1)) / 2;
        return (
          <g key={d.label + i}>
            {d.values.map((v, j) => {
              const h = Math.max(v > 0 ? 3 : 0, (v / max) * plotH);
              return (
                <rect
                  key={j}
                  x={gx + j * (barW + 4)}
                  y={padTop + plotH - h}
                  width={barW}
                  height={h}
                  rx={Math.min(6, barW / 2)}
                  fill={series[j].color}
                  className="chart-bar"
                  style={{ animationDelay: `${i * 45 + j * 30}ms` }}
                >
                  <title>{`${d.label} · ${series[j].name}: ${format(v)}`}</title>
                </rect>
              );
            })}
            <text x={padX + i * groupW + groupW / 2} y={H - 8} className="chart-axis" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ segments, size = 180, thickness = 22, center, sub, label = "Distribution" }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {total > 0 && segments.filter((s) => s.value > 0).map((s, i) => {
          const len = (s.value / total) * c;
          const gap = segments.length > 1 ? Math.min(3, len / 3) : 0;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              className="donut-seg"
              style={{ animationDelay: `${i * 120}ms` }}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.display ?? s.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      {(center != null || sub) && (
        <div className="donut-center">
          {center != null && <b>{center}</b>}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function ProgressRing({ value = 0, size = 120, thickness = 10, color = "url(#ring-grad)", children, label = "Progress" }) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
        <defs>
          <linearGradient id="ring-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.teal} />
            <stop offset="100%" stopColor={PALETTE.blue} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-value"
          style={{ "--ring-c": c }}
        />
      </svg>
      <div className="ring-center">{children ?? <b>{Math.round(v * 100)}%</b>}</div>
    </div>
  );
}

export function Sparkline({ values, color = PALETTE.teal, width = 120, height = 36, fill = true }) {
  if (!values?.length) return null;
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const line = smoothPath(pts);
  const id = `sp-${hash([values, color])}`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" className="chart-line" pathLength="1" />
    </svg>
  );
}

// Horizontal bars rendered in HTML so long labels wrap naturally.
export function HBars({ items, format = (v) => v, max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((item, i) => (
        <div key={item.label} className="hbar">
          <div className="hbar-head">
            <span>{item.label}</span>
            <b>{format(item.value)}</b>
          </div>
          <div className="hbar-track">
            <span style={{ width: `${(item.value / top) * 100}%`, background: item.color || SERIES[i % SERIES.length], animationDelay: `${i * 70}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
