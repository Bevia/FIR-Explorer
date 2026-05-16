// SVG diagrams of direct-form vs transposed-form FIR.
// Schematic only — does not draw every tap for large N. Caps at 6 visible taps with "…".

import type { Structure } from './fpga';

export function StructureDiagram({
  structure,
  symmetric,
  N,
  testId,
}: {
  structure: Structure;
  symmetric: boolean;
  N: number;
  testId?: string;
}) {
  const shownTaps = Math.min(N, 5);
  const showEllipsis = N > shownTaps;
  const width = 720, height = 220;

  if (structure === 'direct') {
    return <DirectForm width={width} height={height} taps={shownTaps} ellipsis={showEllipsis} symmetric={symmetric} testId={testId} />;
  }
  return <TransposedForm width={width} height={height} taps={shownTaps} ellipsis={showEllipsis} symmetric={symmetric} testId={testId} />;
}

function DirectForm({ width, height, taps, ellipsis, symmetric, testId }: { width: number; height: number; taps: number; ellipsis: boolean; symmetric: boolean; testId?: string }) {
  const pad = 32;
  const tapW = (width - pad * 2) / (taps + (ellipsis ? 1 : 0));
  const topY = 60;
  const adderY = 160;

  const cyan = '#22D3EE';
  const muted = '#566273';
  const mag = '#E879A6';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" data-testid={testId}>
      {/* input */}
      <text x={12} y={topY + 4} fontSize="11" fill="#8C97A6" fontFamily="JetBrains Mono">x[n]</text>
      <line x1={36} y1={topY} x2={width - 12} y2={topY} stroke={cyan} strokeOpacity={0.5} strokeWidth={1} />

      {Array.from({ length: taps }).map((_, i) => {
        const x = pad + tapW * (i + 0.5);
        return (
          <g key={i}>
            {/* z^-1 delay block (except the first tap which is x[n]) */}
            {i > 0 && (
              <g>
                <rect x={x - tapW / 2 + 8} y={topY - 12} width={tapW - 16} height={24} rx={3} fill="none" stroke={muted} />
                <text x={x} y={topY + 4} fontSize="10" fill="#8C97A6" textAnchor="middle" fontFamily="JetBrains Mono">z⁻¹</text>
              </g>
            )}
            {/* tap label */}
            <text x={x} y={topY - 18} fontSize="9" fill="#566273" textAnchor="middle" fontFamily="JetBrains Mono">x[n-{i}]</text>
            {/* down line to multiplier */}
            <line x1={x} y1={topY + 12} x2={x} y2={110} stroke={cyan} strokeOpacity={0.5} />
            {/* multiplier */}
            <circle cx={x} cy={120} r={9} fill="none" stroke={cyan} />
            <text x={x} y={123} fontSize="11" fill={cyan} textAnchor="middle">×</text>
            <text x={x + 14} y={123} fontSize="9" fill="#8C97A6" fontFamily="JetBrains Mono">h{i}</text>
            {/* line down to adder bus */}
            <line x1={x} y1={129} x2={x} y2={adderY - 10} stroke={cyan} strokeOpacity={0.45} />
          </g>
        );
      })}

      {ellipsis && (
        <text x={pad + tapW * (taps + 0.5)} y={topY + 4} fontSize="14" fill="#566273" textAnchor="middle">…</text>
      )}

      {/* horizontal adder bus */}
      <line x1={pad + tapW * 0.5} y1={adderY} x2={pad + tapW * (taps - 0.5)} y2={adderY} stroke={mag} strokeOpacity={0.7} strokeWidth={1.2} />
      {/* adder symbol on right */}
      <circle cx={width - pad} cy={adderY} r={11} fill="none" stroke={mag} />
      <text x={width - pad} y={adderY + 4} fontSize="13" fill={mag} textAnchor="middle">Σ</text>
      <line x1={pad + tapW * (taps - 0.5)} y1={adderY} x2={width - pad - 11} y2={adderY} stroke={mag} strokeOpacity={0.7} />
      <line x1={width - pad + 11} y1={adderY} x2={width - 8} y2={adderY} stroke={mag} strokeOpacity={0.7} />
      <text x={width - 6} y={adderY + 4} fontSize="11" fill="#8C97A6" textAnchor="end" fontFamily="JetBrains Mono">y[n]</text>

      <text x={pad} y={height - 8} fontSize="11" fill="#8C97A6" fontFamily="JetBrains Mono">
        Direct form — tapped delay line + adder tree {symmetric ? '· symmetric pre-adders fold tap pairs' : ''}
      </text>
    </svg>
  );
}

function TransposedForm({ width, height, taps, ellipsis, symmetric, testId }: { width: number; height: number; taps: number; ellipsis: boolean; symmetric: boolean; testId?: string }) {
  const pad = 32;
  const slots = taps + (ellipsis ? 1 : 0);
  const tapW = (width - pad * 2) / slots;
  const inputY = 60;
  const sumY = 150;

  const cyan = '#22D3EE';
  const muted = '#566273';
  const mag = '#E879A6';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" data-testid={testId}>
      <text x={12} y={inputY + 4} fontSize="11" fill="#8C97A6" fontFamily="JetBrains Mono">x[n]</text>
      <line x1={36} y1={inputY} x2={width - pad - tapW * 0.5} y2={inputY} stroke={cyan} strokeOpacity={0.5} />

      {Array.from({ length: taps }).map((_, i) => {
        // transposed form: coefficient index goes from h_{N-1} on the left to h_0 on the right
        const x = pad + tapW * (i + 0.5);
        const coeffIdx = taps - 1 - i;
        return (
          <g key={i}>
            {/* tap down line */}
            <line x1={x} y1={inputY} x2={x} y2={100} stroke={cyan} strokeOpacity={0.5} />
            {/* multiplier */}
            <circle cx={x} cy={110} r={9} fill="none" stroke={cyan} />
            <text x={x} y={113} fontSize="11" fill={cyan} textAnchor="middle">×</text>
            <text x={x + 14} y={113} fontSize="9" fill="#8C97A6" fontFamily="JetBrains Mono">h{coeffIdx}</text>
            {/* adder + register at bottom */}
            <circle cx={x} cy={sumY} r={9} fill="none" stroke={mag} />
            <text x={x} y={sumY + 4} fontSize="11" fill={mag} textAnchor="middle">+</text>
            <line x1={x} y1={119} x2={x} y2={sumY - 9} stroke={cyan} strokeOpacity={0.45} />
            {/* register (z^-1) to the right of the adder */}
            {i < taps - 1 && (
              <g>
                <rect x={x + 9} y={sumY - 11} width={tapW - 18} height={22} rx={3} fill="none" stroke={muted} />
                <text x={x + tapW / 2} y={sumY + 4} fontSize="10" fill="#8C97A6" textAnchor="middle" fontFamily="JetBrains Mono">z⁻¹</text>
                <line x1={x + tapW - 9} y1={sumY} x2={pad + tapW * (i + 1.5) - 9} y2={sumY} stroke={mag} strokeOpacity={0.55} />
              </g>
            )}
          </g>
        );
      })}

      {ellipsis && (
        <text x={pad + tapW * (taps + 0.5)} y={sumY + 4} fontSize="14" fill="#566273" textAnchor="middle">…</text>
      )}

      {/* output */}
      <line x1={pad + tapW * (taps - 0.5) + 9} y1={sumY} x2={width - 8} y2={sumY} stroke={mag} strokeOpacity={0.7} />
      <text x={width - 6} y={sumY + 4} fontSize="11" fill="#8C97A6" textAnchor="end" fontFamily="JetBrains Mono">y[n]</text>

      <text x={pad} y={height - 8} fontSize="11" fill="#8C97A6" fontFamily="JetBrains Mono">
        Transposed form — broadcast input, per-tap MAC + accumulator pipeline {symmetric ? '· symmetric coefficients (pre-adder savings)' : ''}
      </text>
    </svg>
  );
}
