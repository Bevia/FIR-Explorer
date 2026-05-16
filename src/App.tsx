import { useEffect, useMemo, useState } from 'react';
import {
  designLowpass,
  freqResponse,
  computeMetrics,
  PRESETS,
  type WindowType,
  type PresetKey,
} from './dsp';
import { estimateFpga, type Structure } from './fpga';
import { MagnitudeChart, CoeffChart, PhaseChart } from './charts';
import { StructureDiagram } from './structures';

// ---- small UI primitives ----
function Slider({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
  testId,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="text-sm num font-medium text-ink" data-testid={`${testId}-value`}>
          {value}
          {unit ? <span className="text-ink-muted ml-0.5">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        className="fir-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        aria-label={label}
      />
      {hint && <div className="text-[11px] text-ink-faint leading-snug">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  testId,
}: {
  options: { v: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-bg border border-line" data-testid={testId}>
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              active
                ? 'bg-accent/10 text-accent ring-1 ring-accent/40'
                : 'text-ink-muted hover:text-ink hover:bg-bg-raised'
            }`}
            data-testid={`${testId}-${o.v}`}
            title={o.hint}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'mag';
  testId: string;
}) {
  const toneColor =
    tone === 'good' ? 'text-accent-green' : tone === 'warn' ? 'text-accent-warm' : tone === 'mag' ? 'text-accent-mag' : 'text-ink';
  return (
    <div className="panel p-3 flex flex-col gap-1" data-testid={testId}>
      <div className="label">{label}</div>
      <div className={`text-lg font-semibold num ${toneColor}`}>
        {value}
        {unit && <span className="text-xs text-ink-muted ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-ink-faint leading-snug">{hint}</div>}
    </div>
  );
}

function Pill({ tone, children, testId }: { tone: 'good' | 'mid' | 'bad' | 'neutral'; children: React.ReactNode; testId?: string }) {
  const cls =
    tone === 'good'
      ? 'bg-accent-green/10 text-accent-green ring-accent-green/30'
      : tone === 'mid'
      ? 'bg-accent-warm/10 text-accent-warm ring-accent-warm/30'
      : tone === 'bad'
      ? 'bg-accent-mag/10 text-accent-mag ring-accent-mag/30'
      : 'bg-bg-raised text-ink-muted ring-line';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ring-1 ${cls}`} data-testid={testId}>{children}</span>;
}

function CoefficientTable({
  h,
  hq,
  scale,
  coeffBits,
}: {
  h: number[];
  hq: number[];
  scale: number;
  coeffBits: number;
}) {
  const hexWidth = Math.ceil(coeffBits / 4);
  const modulus = Math.pow(2, coeffBits);
  const rows = h.map((ideal, i) => {
    const fixedInt = Math.round(hq[i] * scale);
    const twos = fixedInt < 0 ? fixedInt + modulus : fixedInt;
    return {
      i,
      ideal,
      quantized: hq[i],
      fixedInt,
      hex: `0x${twos.toString(16).toUpperCase().padStart(hexWidth, '0')}`,
      error: hq[i] - ideal,
    };
  });

  function exportCsv() {
    const csvEscape = (value: string | number) => {
      const s = String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['tap', 'ideal_h', 'quantized_h', 'quantization_error', 'fixed_int', 'twos_complement_hex'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          `h${r.i}`,
          r.ideal.toPrecision(12),
          r.quantized.toPrecision(12),
          r.error.toPrecision(12),
          r.fixedInt,
          r.hex,
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fir_coefficients_${h.length}_taps_${coeffBits}_bit.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel p-4 space-y-3" data-testid="card-coefficient-table">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="label">Coefficient weights h[0] … h[N−1]</div>
          <div className="text-sm text-ink mt-1">
            Current set: <span className="num text-accent">{h.length}</span> taps · signed {coeffBits}-bit · scale ≈ <span className="num">{scale.toFixed(0)}</span> LSB/full-scale
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone="neutral" testId="coeff-table-count">{h.length} rows</Pill>
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-1.5 text-xs rounded border border-line hover:border-line-strong text-ink-muted hover:text-ink transition-colors"
            data-testid="button-export-coefficients"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="max-h-[360px] overflow-auto rounded-md border border-line" data-testid="coeff-table-scroll">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="sticky top-0 bg-bg-raised text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left font-medium">Tap</th>
              <th className="px-3 py-2 text-right font-medium">Ideal h[n]</th>
              <th className="px-3 py-2 text-right font-medium">Quantized hq[n]</th>
              <th className="px-3 py-2 text-right font-medium">Error</th>
              <th className="px-3 py-2 text-right font-medium">Fixed int</th>
              <th className="px-3 py-2 text-right font-medium">Two's-comp hex</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60" data-testid="coeff-table-body">
            {rows.map((r) => (
              <tr key={r.i} className="hover:bg-bg-raised/70" data-testid={`coeff-row-${r.i}`}>
                <td className="px-3 py-1.5 text-ink font-medium num">h{r.i}</td>
                <td className="px-3 py-1.5 text-right text-ink-muted num">{r.ideal.toExponential(8)}</td>
                <td className="px-3 py-1.5 text-right text-ink num">{r.quantized.toExponential(8)}</td>
                <td className="px-3 py-1.5 text-right text-ink-faint num">{r.error.toExponential(2)}</td>
                <td className="px-3 py-1.5 text-right text-ink-muted num">{r.fixedInt}</td>
                <td className="px-3 py-1.5 text-right text-accent num">{r.hex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-ink-faint leading-snug">
        The fixed integer column is computed as round(hq[n] × scale). Hex is shown as signed two's-complement using the selected coefficient word size.
      </div>
    </section>
  );
}

// ---- main app ----
export default function App() {
  const [N, setN] = useState(65);
  const [coeffBits, setCoeffBits] = useState(16);
  const [fs, setFs] = useState(48000);
  const [fc, setFc] = useState(8000);
  const [windowType, setWindowType] = useState<WindowType>('hamming');
  const [structure, setStructure] = useState<Structure>('direct');
  const [symmetric, setSymmetric] = useState(true);
  const [dataBits, setDataBits] = useState(16);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activePreset, setActivePreset] = useState<PresetKey | null>('symmetric');

  // theme toggle
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  // clamp fc
  useEffect(() => {
    if (fc >= fs / 2) setFc(Math.floor(fs / 2 - 100));
  }, [fs, fc]);

  function applyPreset(key: PresetKey) {
    const p = PRESETS[key].params;
    if (p.N) setN(p.N);
    if (p.coeffBits) setCoeffBits(p.coeffBits);
    if (p.window) setWindowType(p.window);
    setActivePreset(key);
  }

  // design + analysis
  const { h, hq, scale } = useMemo(
    () => designLowpass({ N, fs, fc, window: windowType, symmetric, coeffBits }),
    [N, fs, fc, windowType, symmetric, coeffBits]
  );
  const responseQuant = useMemo(() => freqResponse(hq, 512), [hq]);
  const metrics = useMemo(() => computeMetrics(h, hq, fs, fc, 1024), [h, hq, fs, fc]);

  const fpga = useMemo(
    () => estimateFpga({ N, coeffBits, dataBits, structure, symmetric }),
    [N, coeffBits, dataBits, structure, symmetric]
  );

  const fmaxTone = fpga.fmaxQual === 'high' ? 'good' : fpga.fmaxQual === 'medium' ? 'mid' : 'bad';
  const routingTone = fpga.routingQual === 'easy' ? 'good' : fpga.routingQual === 'moderate' ? 'mid' : 'bad';

  return (
    <div className="min-h-screen bg-bg text-ink dark:bg-bg dark:text-ink">
      {/* Header */}
      <header className="border-b border-line/60 sticky top-0 z-10 backdrop-blur-md bg-bg/85" data-testid="app-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex flex-col">
              <div className="text-sm font-semibold tracking-tight">FIR Explorer</div>
              <div className="text-[11px] text-ink-muted -mt-0.5">DSP design + FPGA tradeoff studio</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-[11px] text-ink-faint font-mono">
              {N} taps · {coeffBits}-bit · {windowType} · {structure}
            </span>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="px-3 py-1.5 text-xs rounded border border-line hover:border-line-strong text-ink-muted hover:text-ink transition-colors"
              data-testid="button-theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: control rail */}
        <aside className="space-y-4" data-testid="control-rail">
          {/* Presets */}
          <section className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="label">Presets</div>
              <span className="text-[10px] text-ink-faint">click to load</span>
            </div>
            <div className="space-y-1.5" data-testid="preset-list">
              {(Object.entries(PRESETS) as [PresetKey, typeof PRESETS[PresetKey]][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  className={`w-full text-left px-2.5 py-2 rounded text-xs transition-colors border ${
                    activePreset === k
                      ? 'border-accent/40 bg-accent/5 text-ink'
                      : 'border-transparent hover:border-line text-ink-muted hover:text-ink hover:bg-bg-raised'
                  }`}
                  data-testid={`preset-${k}`}
                >
                  <div className="font-medium text-ink">{v.label}</div>
                  <div className="text-[11px] text-ink-faint mt-0.5 leading-snug">{v.tagline}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Filter design */}
          <section className="panel p-4 space-y-4">
            <div className="label">Filter design</div>
            <Slider
              label="Taps (N)"
              testId="slider-taps"
              min={8}
              max={256}
              value={N}
              onChange={(v) => {
                setN(v);
                setActivePreset(null);
              }}
              hint={symmetric && N % 2 === 0 ? 'Even N → Type II linear-phase (notch at Nyquist).' : 'Odd N → Type I linear-phase (most flexible).'}
            />
            <Slider
              label="Coefficient word size"
              unit="bits"
              testId="slider-bits"
              min={4}
              max={24}
              value={coeffBits}
              onChange={(v) => {
                setCoeffBits(v);
                setActivePreset(null);
              }}
              hint="Signed, two's complement. 18 bits is the DSP48 sweet spot."
            />
            <Slider
              label="Data sample width"
              unit="bits"
              testId="slider-databits"
              min={8}
              max={24}
              value={dataBits}
              onChange={setDataBits}
              hint="Input ADC sample width — affects accumulator growth."
            />
          </section>

          {/* Frequency */}
          <section className="panel p-4 space-y-4">
            <div className="label">Spectrum</div>
            <Slider
              label="Sample rate"
              unit="Hz"
              testId="slider-fs"
              min={8000}
              max={192000}
              step={1000}
              value={fs}
              onChange={setFs}
            />
            <Slider
              label="Cutoff fc"
              unit="Hz"
              testId="slider-fc"
              min={200}
              max={Math.max(400, Math.floor(fs / 2 - 100))}
              step={100}
              value={fc}
              onChange={setFc}
              hint={`Normalized: ${(fc / fs).toFixed(3)} × fs · ${(fc / (fs / 2) * 100).toFixed(1)}% of Nyquist`}
            />
            <div>
              <div className="label mb-1.5">Window</div>
              <div className="grid grid-cols-2 gap-1" data-testid="window-select">
                {(['hamming', 'blackman', 'hann', 'rectangular'] as WindowType[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => {
                      setWindowType(w);
                      setActivePreset(null);
                    }}
                    className={`px-2 py-1.5 rounded text-xs capitalize transition-colors ${
                      windowType === w
                        ? 'bg-accent/10 text-accent ring-1 ring-accent/40'
                        : 'bg-bg border border-line text-ink-muted hover:text-ink hover:bg-bg-raised'
                    }`}
                    data-testid={`window-${w}`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Structure */}
          <section className="panel p-4 space-y-3">
            <div className="label">Hardware structure</div>
            <Segmented
              testId="structure-select"
              value={structure}
              onChange={setStructure}
              options={[
                { v: 'direct', label: 'Direct form' },
                { v: 'transposed', label: 'Transposed' },
              ]}
            />
            <label className="flex items-center justify-between text-xs text-ink-muted cursor-pointer">
              <span>Linear-phase symmetry savings</span>
              <input
                type="checkbox"
                className="accent-accent"
                checked={symmetric}
                onChange={(e) => setSymmetric(e.target.checked)}
                data-testid="checkbox-symmetric"
              />
            </label>
            <div className="text-[11px] text-ink-faint leading-snug">
              Symmetric windowed-sinc FIR is always linear-phase. Toggle off to compare resource cost of a non-symmetric layout.
            </div>
          </section>
        </aside>

        {/* Right: dashboard */}
        <div className="space-y-6 min-w-0">
          {/* Top metrics row */}
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="metrics-row">
            <MetricCard
              testId="metric-passband"
              label="Passband ripple"
              value={metrics.passbandRippleDb.toFixed(2)}
              unit="dB"
              tone={metrics.passbandRippleDb < 0.5 ? 'good' : metrics.passbandRippleDb < 2 ? 'warn' : 'mag'}
              hint={metrics.passbandRippleDb < 0.5 ? 'Flat passband.' : 'Visible passband variation.'}
            />
            <MetricCard
              testId="metric-stopband"
              label="Stopband attenuation"
              value={metrics.stopbandAttDb === Infinity ? '∞' : metrics.stopbandAttDb.toFixed(1)}
              unit="dB"
              tone={metrics.stopbandAttDb > 60 ? 'good' : metrics.stopbandAttDb > 35 ? 'warn' : 'mag'}
              hint="Worst-case sidelobe in stopband."
            />
            <MetricCard
              testId="metric-transition"
              label="Transition width"
              value={metrics.transitionWidthHz.toFixed(0)}
              unit="Hz"
              hint="From −3 dB to −40 dB."
            />
            <MetricCard
              testId="metric-snr"
              label="Coeff. RMS quantization SNR"
              value={metrics.quantSNRDb.toFixed(1)}
              unit="dB"
              tone={metrics.quantSNRDb > 70 ? 'good' : metrics.quantSNRDb > 40 ? 'warn' : 'mag'}
              hint={`Measured on h[n] RMS, not ideal ADC SNR. Error ${(metrics.quantRMSError * 1e6).toFixed(2)} × 10⁻⁶`}
            />
            <MetricCard
              testId="metric-groupdelay"
              label="Group delay"
              value={metrics.groupDelaySamples.toFixed(1)}
              unit="samples"
              hint={`${((metrics.groupDelaySamples / fs) * 1e6).toFixed(1)} µs at ${fs / 1000} kHz`}
            />
          </section>

          {/* Magnitude response chart */}
          <section className="panel p-4 space-y-2" data-testid="card-magnitude">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="label">Magnitude response</div>
                <div className="text-sm text-ink mt-1">
                  Quantized to <span className="text-accent num">{coeffBits} bits</span>, full-scale ≈ <span className="num">{scale.toFixed(0)} LSB</span>
                </div>
              </div>
              <div className="flex gap-1.5 text-[11px] text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent inline-block" />response</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent-warm inline-block" style={{ borderTop: '1px dashed' }} />cutoff</span>
              </div>
            </div>
            <MagnitudeChart magDb={responseQuant.magDb} fs={fs} fc={fc} testId="chart-magnitude" />
          </section>

          {/* Coefficient + phase row */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" data-testid="row-coeff-phase">
            <div className="panel p-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="label">Coefficient stems</div>
                <div className="text-[11px] text-ink-muted num">
                  peak {metrics.coeffPeak.toFixed(4)} · Σh = {metrics.coeffSum.toFixed(4)}
                </div>
              </div>
              <CoeffChart h={h} hq={hq} testId="chart-coeff" />
            </div>
            <div className="panel p-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="label">Passband phase</div>
                <div className="text-[11px] text-ink-muted">
                  {symmetric ? 'linear phase (constant group delay)' : 'general phase'}
                </div>
              </div>
              <PhaseChart phase={responseQuant.phase} fs={fs} fc={fc} testId="chart-phase" />
            </div>
          </section>

          <CoefficientTable h={h} hq={hq} scale={scale} coeffBits={coeffBits} />

          {/* FPGA estimator */}
          <section className="space-y-3" data-testid="fpga-section">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold tracking-tight">FPGA resource estimate</h2>
              <span className="text-[11px] text-ink-faint">Heuristic · Xilinx 7-series / DSP48 class · architecture & device dependent</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="fpga-metrics">
              <MetricCard testId="fpga-dsp" label="DSP slices" value={fpga.dspSlices} hint={`${fpga.uniqueMultipliers} unique multipliers`} />
              <MetricCard testId="fpga-luts" label="LUTs" value={fpga.luts.toLocaleString()} hint="adder tree / glue logic" />
              <MetricCard testId="fpga-ffs" label="Flip-flops" value={fpga.ffs.toLocaleString()} hint={`delay line + pipeline regs`} />
              <MetricCard testId="fpga-bram" label="BRAM" value={fpga.bramKbits === 0 ? '0' : fpga.bramKbits} unit={fpga.bramKbits === 0 ? '' : 'Kb'} hint={fpga.bramKbits ? 'coefficient ROM' : 'not required'} />
              <MetricCard testId="fpga-latency" label="Latency" value={fpga.latencyCycles} unit="cycles" hint={`${((fpga.latencyCycles / fs) * 1e6).toFixed(2)} µs at ${fs / 1000} kHz`} />
              <MetricCard
                testId="fpga-accum"
                label="Accumulator"
                value={fpga.accumulatorBits}
                unit="bits"
                hint={`coeff(${coeffBits}) + data(${dataBits}) + ⌈log₂ N⌉`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="panel p-3 flex items-center justify-between" data-testid="fpga-fmax">
                <span className="label">Estimated fmax</span>
                <Pill tone={fmaxTone}>{fpga.fmaxQual}</Pill>
              </div>
              <div className="panel p-3 flex items-center justify-between" data-testid="fpga-routing">
                <span className="label">Routing pressure</span>
                <Pill tone={routingTone}>{fpga.routingQual}</Pill>
              </div>
              <div className="panel p-3 flex items-center justify-between" data-testid="fpga-symmetry">
                <span className="label">Symmetry savings</span>
                <Pill tone={symmetric ? 'good' : 'neutral'}>{symmetric ? `${Math.floor((1 - fpga.uniqueMultipliers / N) * 100)}% multipliers saved` : 'off'}</Pill>
              </div>
            </div>

            {/* Structure diagram */}
            <div className="panel p-4 space-y-3" data-testid="card-structure-diagram">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="label">{structure === 'direct' ? 'Direct form schematic' : 'Transposed form schematic'}</div>
                  <div className="text-sm text-ink mt-1">
                    {structure === 'direct'
                      ? 'Shared adder tree, narrow delay line. Critical path grows with N.'
                      : 'Per-tap accumulator, broadcast input. DSP48 P-cascade does the heavy lifting.'}
                  </div>
                </div>
                <div className="text-[11px] text-ink-muted font-mono">N = {N}{N > 5 ? ' (first 5 taps shown)' : ''}</div>
              </div>
              <StructureDiagram structure={structure} symmetric={symmetric} N={N} testId="diagram-structure" />
            </div>

            {/* Notes */}
            <div className="panel p-4 space-y-2" data-testid="fpga-notes">
              <div className="label">Architecture notes</div>
              <ul className="text-sm text-ink-muted space-y-1.5">
                {fpga.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent select-none mt-1.5 leading-none">·</span>
                    <span className="leading-snug">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Direct vs Transposed comparison callout */}
          <section className="panel-raised p-5" data-testid="comparison-callout">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-semibold tracking-tight">Direct vs. Transposed — at a glance</h2>
              <span className="text-[11px] text-ink-faint">teaching reference</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-sm font-medium text-ink">Direct form</span>
                </div>
                <ul className="text-[13px] text-ink-muted space-y-1.5 leading-snug">
                  <li>· Tapped delay line on input (narrow registers, dataBits wide).</li>
                  <li>· One multiply per tap, all products summed by a shared adder tree.</li>
                  <li>· Critical path = mult + log₂(N) adder stages. Needs pipelining as N grows.</li>
                  <li>· Linear-phase symmetry halves multiplier count via pre-adders (DSP48 absorbs it).</li>
                  <li>· Best fit: small-to-medium N, tight area budget, classroom-friendly mental model.</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-mag" />
                  <span className="text-sm font-medium text-ink">Transposed form</span>
                </div>
                <ul className="text-[13px] text-ink-muted space-y-1.5 leading-snug">
                  <li>· Broadcast input to every tap; each tap holds a wide accumulator register.</li>
                  <li>· Maps 1-to-1 onto DSP48 cascaded MACs with the P-port carry chain.</li>
                  <li>· Critical path between consecutive taps is a single add → high fmax even at N &gt; 200.</li>
                  <li>· Higher register count (accumBits ≫ dataBits), but routing is local and predictable.</li>
                  <li>· Best fit: high-fmax DSP, deep filters, anything that wants timing closure first try.</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-line text-[12px] text-ink-faint leading-relaxed">
              <span className="text-ink-muted">Rule of thumb:</span> at low tap counts the two forms cost about the same; the divergence shows up
              past ~64 taps, where direct-form adder-tree depth starts hurting fmax and transposed form's local pipelining stays flat.
              Both implement the same transfer function — identical magnitude/phase response — so the choice is purely an implementation tradeoff.
            </div>
          </section>

          <footer className="text-[11px] text-ink-faint pt-2 pb-6 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="footer">
            <span>FIR Explorer · all computation in-browser, no telemetry, no storage.</span>
            <span className="num">window = {windowType} · structure = {structure} · symmetric = {symmetric ? 'on' : 'off'}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width={28} height={28} aria-label="FIR Explorer logo">
      <rect width="32" height="32" rx="6" fill="currentColor" opacity="0.08" />
      {/* sinc-like impulse: rising stem trace then decaying */}
      <g stroke="#22D3EE" strokeWidth="1.6" strokeLinecap="round">
        <line x1="5" y1="22" x2="5" y2="20" />
        <line x1="9" y1="22" x2="9" y2="14" />
        <line x1="13" y1="22" x2="13" y2="6" />
        <line x1="17" y1="22" x2="17" y2="13" />
        <line x1="21" y1="22" x2="21" y2="18" />
        <line x1="25" y1="22" x2="25" y2="21" />
      </g>
      <line x1="3" y1="22" x2="29" y2="22" stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}
