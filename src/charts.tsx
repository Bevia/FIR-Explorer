import { useMemo } from 'react';

// ----- magnitude response chart (in dB) -----
export function MagnitudeChart({
  magDb,
  fs,
  fc,
  height = 300,
  testId,
}: {
  magDb: number[];
  fs: number;
  fc: number;
  height?: number;
  testId?: string;
}) {
  const width = 720;
  const pad = { l: 56, r: 24, t: 16, b: 36 };
  const yMin = -120, yMax = 5;
  const xScale = (i: number) => pad.l + (i / (magDb.length - 1)) * (width - pad.l - pad.r);
  const yScale = (db: number) => {
    const v = Math.max(yMin, Math.min(yMax, db));
    return pad.t + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  };

  const path = useMemo(() => {
    let d = '';
    for (let i = 0; i < magDb.length; i++) {
      const x = xScale(i);
      const y = yScale(magDb[i]);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    return d;
  }, [magDb]);

  // x-axis: frequency from 0 to fs/2
  const xTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const yTicks = [0, -20, -40, -60, -80, -100];

  const fcNorm = fc / fs;
  const fcX = pad.l + (fcNorm / 0.5) * (width - pad.l - pad.r);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-ink-muted" data-testid={testId}>
      {/* grid */}
      {yTicks.map((y, i) => (
        <line key={i} x1={pad.l} x2={width - pad.r} y1={yScale(y)} y2={yScale(y)} stroke="currentColor" strokeOpacity={0.08} />
      ))}
      {/* zero ref */}
      <line x1={pad.l} x2={width - pad.r} y1={yScale(0)} y2={yScale(0)} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="2 3" />
      {/* cutoff marker */}
      <line x1={fcX} x2={fcX} y1={pad.t} y2={height - pad.b} stroke="#F5A524" strokeOpacity={0.55} strokeDasharray="4 4" />
      <text x={fcX + 4} y={pad.t + 12} fontSize="10" fill="#F5A524" fontFamily="JetBrains Mono">fc</text>
      {/* response trace */}
      <path d={path} fill="none" stroke="#22D3EE" strokeWidth={1.6} strokeLinejoin="round" />
      {/* axes */}
      {yTicks.map((y) => (
        <text key={`yt-${y}`} x={pad.l - 8} y={yScale(y) + 3} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">
          {y}
        </text>
      ))}
      {xTicks.map((t, i) => {
        const x = pad.l + (t / 0.5) * (width - pad.l - pad.r);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={height - pad.b} y2={height - pad.b + 4} stroke="currentColor" strokeOpacity={0.4} />
            <text x={x} y={height - pad.b + 16} textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">
              {t === 0 ? '0' : (t * fs).toFixed(0)}
            </text>
          </g>
        );
      })}
      {/* axis labels */}
      <text x={pad.l} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7}>frequency (Hz)</text>
      <text x={8} y={pad.t + 8} fontSize="10" fill="currentColor" opacity={0.7}>magnitude (dB)</text>
    </svg>
  );
}

// ----- coefficient stem plot -----
export function CoeffChart({
  h,
  hq,
  height = 200,
  testId,
}: {
  h: number[];
  hq: number[];
  height?: number;
  testId?: string;
}) {
  const width = 720;
  const pad = { l: 56, r: 24, t: 12, b: 30 };
  const peak = Math.max(...hq.map((x) => Math.abs(x)), 0.001);
  const yMin = -peak * 1.1, yMax = peak * 1.1;
  const xScale = (i: number) => pad.l + (i / Math.max(h.length - 1, 1)) * (width - pad.l - pad.r);
  const yScale = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  const zeroY = yScale(0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-ink-muted" data-testid={testId}>
      <line x1={pad.l} x2={width - pad.r} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity={0.2} />
      {hq.map((v, i) => {
        const x = xScale(i);
        const y = yScale(v);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={zeroY} y2={y} stroke="#22D3EE" strokeOpacity={0.65} strokeWidth={1} />
            <circle cx={x} cy={y} r={1.5} fill="#22D3EE" />
            {/* ideal as faint marker */}
            <circle cx={x} cy={yScale(h[i])} r={1} fill="#F5A524" opacity={0.5} />
          </g>
        );
      })}
      {/* axes */}
      <text x={pad.l - 8} y={yScale(peak) + 3} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">
        {peak.toFixed(3)}
      </text>
      <text x={pad.l - 8} y={zeroY + 3} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">0</text>
      <text x={pad.l - 8} y={yScale(-peak) + 3} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">
        {(-peak).toFixed(3)}
      </text>
      <text x={pad.l} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7}>tap index n</text>
      <text x={width - pad.r} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7} textAnchor="end">
        <tspan fill="#22D3EE">■</tspan> quantized · <tspan fill="#F5A524">■</tspan> ideal
      </text>
    </svg>
  );
}

// ----- phase chart -----
export function PhaseChart({
  phase,
  fs,
  fc,
  height = 170,
  testId,
}: {
  phase: number[];
  fs: number;
  fc: number;
  height?: number;
  testId?: string;
}) {
  const width = 720;
  const pad = { l: 64, r: 26, t: 22, b: 32 };
  const yMin = -Math.PI, yMax = Math.PI;
  const phaseLimitNorm = Math.min(0.5, (fc * 1.25) / fs);
  const phaseLimitIndex = Math.max(2, Math.floor((phaseLimitNorm / 0.5) * (phase.length - 1)));
  const xScale = (i: number) => pad.l + (i / phaseLimitIndex) * (width - pad.l - pad.r);
  const yScale = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.t - pad.b);
  let d = '';
  for (let i = 0; i <= phaseLimitIndex; i++) {
    // do not connect across wraps
    if (i > 0 && Math.abs(phase[i] - phase[i - 1]) > Math.PI) {
      d += `M${xScale(i).toFixed(1)} ${yScale(phase[i]).toFixed(1)} `;
    } else {
      d += (i === 0 ? 'M' : 'L') + xScale(i).toFixed(1) + ' ' + yScale(phase[i]).toFixed(1) + ' ';
    }
  }
  const fcNorm = fc / fs;
  const fcX = pad.l + (fcNorm / phaseLimitNorm) * (width - pad.l - pad.r);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-ink-muted" data-testid={testId}>
      <line x1={pad.l} x2={width - pad.r} y1={yScale(0)} y2={yScale(0)} stroke="currentColor" strokeOpacity={0.2} />
      <line x1={fcX} x2={fcX} y1={pad.t} y2={height - pad.b} stroke="#F5A524" strokeOpacity={0.55} strokeDasharray="4 4" />
      <text x={fcX + 4} y={pad.t + 10} fontSize="10" fill="#F5A524" fontFamily="JetBrains Mono">fc</text>
      <path d={d} fill="none" stroke="#E879A6" strokeWidth={1.4} />
      <text x={pad.l - 10} y={yScale(Math.PI) + 4} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">π</text>
      <text x={pad.l - 10} y={yScale(0) + 4} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">0</text>
      <text x={pad.l - 10} y={yScale(-Math.PI) - 2} textAnchor="end" fontSize="10" fill="currentColor" fontFamily="JetBrains Mono">-π</text>
      <text x={pad.l} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7}>0 → {(phaseLimitNorm * fs).toFixed(0)} Hz</text>
      <text x={width - pad.r} y={height - 6} fontSize="10" fill="currentColor" opacity={0.7} textAnchor="end">passband phase (wrapped)</text>
    </svg>
  );
}
