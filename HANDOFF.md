# FIR Explorer — Handoff

## Project path
`/home/user/workspace/fir-explorer`

A polished, single-page browser app for teaching FIR filter design and FPGA tradeoffs. All math runs in-browser; no backend, no storage.

## How to run / build

```bash
cd /home/user/workspace/fir-explorer
npm install            # already done
npm run dev            # vite dev server on :5173
npm run build          # production build → dist/
npm run preview        # serves dist/ for QA
```

Deploy target: `dist/` (static files only). `vite.config.ts` sets `base: './'` so the bundle works from any subpath — `deploy_website(project_path="fir-explorer/dist")` should just work.

## Stack
- **Vite + React 19 + TypeScript** (the bare `react-ts` template, not the fullstack webapp template — there is no server logic, so the heavier template would be dead weight)
- **Tailwind v3** for utilities (config in `tailwind.config.js`, base directives in `src/index.css`)
- **Custom SVG charts** (no Recharts/D3 dependency) — `src/charts.tsx` and `src/structures.tsx`
- **Fonts:** Inter + JetBrains Mono loaded from Google Fonts (the mono is used for axis labels, numerics, and signal annotations — appropriate for an engineering tool)

## Key files

| File | What's in it |
|---|---|
| `src/dsp.ts` | Windowed-sinc FIR design, coefficient quantization (signed two's complement), DFT-based magnitude/phase response, metrics (passband ripple, stopband attenuation, transition width, group delay, quantization SNR/error), 5 named presets. |
| `src/fpga.ts` | Heuristic FPGA estimator. Models DSP48-class behavior: 25×18 multiply primitive (>18-bit coefficients consume extra DSP slices), accumulator width = `coeffBits + dataBits + ⌈log₂ N⌉`, symmetry savings (`ceil(N/2)` unique multipliers for linear-phase), direct-form adder-tree LUT/FF accounting vs transposed P-cascade. Returns numeric estimates + qualitative fmax/routing pills + a list of architecture notes. |
| `src/charts.tsx` | `MagnitudeChart`, `CoeffChart`, `PhaseChart` — pure SVG, viewBox-based, no client libs. Engineering grid + cyan signal trace + amber cutoff marker + magenta phase. |
| `src/structures.tsx` | `StructureDiagram` — schematic SVG of either Direct form (tapped delay line + adder tree to Σ) or Transposed form (broadcast input + per-tap accumulator chain). Caps at 5 visible taps with ellipsis. |
| `src/App.tsx` | Dashboard composition. Left control rail (presets, taps/bits/data slider, fs/fc/window, structure + symmetry toggle), right side metric strip + magnitude chart + coeff/phase row + FPGA estimator + direct-vs-transposed teaching callout. Includes a `Logo` and a theme toggle. |
| `src/index.css` | Dark-first design tokens, light-mode override layer, custom range slider styling, scrollbars, panel/label/hairline component classes. |
| `tailwind.config.js` | Custom palette (`bg`, `bg-surface`, `bg-raised`, `line`, `ink`, `ink-muted`, `accent`, `accent-warm`, `accent-mag`, `accent-green`), `darkMode: 'class'`. |
| `index.html` | Inline favicon (cyan sinc curve on graphite tile), fonts preconnect, meta description, `<html class="dark">` default. |

## Design / content decisions

**Visual identity — "engineering instrument."** Graphite background `#0B0E12` with a cyan signal accent `#22D3EE` (matches the standard scope trace color most DSP engineers default to in MATLAB / GNU Radio / SigDigger). Amber `#F5A524` for cutoff markers, magenta `#E879A6` for phase + adder symbols, green `#5DCC8A` reserved for "good" tone pills. Intentionally avoids the soft-pastel SaaS look — every panel has a 1px hairline and uses tabular numerics.

**Dark mode is the default; light mode is a complete override** keyed to `html.light` in `src/index.css`. The light theme remaps the same Tailwind utility classes (`bg-bg`, `text-ink`, etc.) via CSS variables + `!important` so no component code has `light:` modifiers. Toggle is in the header.

**Layout.** 280-px left control rail + fluid right column on `lg+`, collapsing to a single mobile column under 1024 px. Sticky header for context.

**Charts.** Hand-rolled SVG was chosen over Recharts because (a) we need cutoff/grid markers + log dB scales + non-uniform stem plots, all easier directly, (b) bundle stays tiny (222 KB JS / 68 KB gzipped), and (c) the visual style is fully controlled — no Recharts default-look leakage. Magnitude is plotted from 0 → fs/2 with dB ticks at -20 dB increments; coefficient stems overlay quantized (cyan) on ideal (amber) so the quantization gap is visible at low bit widths.

**Presets** (`src/dsp.ts`):
- *Balanced default* — 64 taps · 16 bit · Hamming
- *Symmetric linear-phase* — 65 taps · 18 bit · Hamming (default load)
- *Narrowband / high-order* — 193 taps · 20 bit · Blackman
- *Resource-constrained* — 25 taps · 8 bit · Hamming
- *High-quality audio* — 129 taps · 24 bit · Blackman

**FPGA estimator narrative.** Heuristic, labeled as such. The estimator deliberately surfaces tradeoffs Vincent will recognize:
- Symmetry savings: shows "X% multipliers saved" pill when linear-phase, halving `uniqueMultipliers`.
- Coefficient bits > 18 → architecture note flags that each multiply burns 2 DSP slices.
- Direct form fmax/routing degrade as N grows (≤32 high/easy, ≤96 medium/moderate, >96 low/congested); transposed stays high/easy until ~200 taps.
- LUT model: direct form has `(uniqueMultipliers − 1) × accumBits × 1.1` for the adder tree; transposed has ~`N × 4 + accumBits × 2` (much lighter — DSP48 P-cascade replaces the tree).
- FF model: direct form has tapped delay line of `(N−1) × dataBits` + pipeline regs; transposed has `(N−1) × accumBits` (wider but fewer combinational paths).
- Latency: direct form = `1 + ⌈log₂(uniqueMults)⌉ + 1`; transposed = `N + 3`.
- BRAM only modeled at N ≥ 256.

The numbers won't match a vendor synthesis tool, and the UI says so ("Heuristic · Xilinx 7-series / DSP48 class · architecture & device dependent"). They're directionally correct and good for teaching/sizing.

**Data-testid coverage.** Every interactive control and important readout has a `data-testid`:
- `button-theme`, `preset-{key}`, `window-{name}`, `structure-select`, `structure-select-direct`, `structure-select-transposed`, `checkbox-symmetric`
- `slider-taps`, `slider-bits`, `slider-databits`, `slider-fs`, `slider-fc` (each with `-value` companion)
- `metric-passband`, `metric-stopband`, `metric-transition`, `metric-snr`, `metric-groupdelay`
- `fpga-dsp`, `fpga-luts`, `fpga-ffs`, `fpga-bram`, `fpga-latency`, `fpga-accum`, `fpga-fmax`, `fpga-routing`, `fpga-symmetry`, `fpga-notes`
- `chart-magnitude`, `chart-coeff`, `chart-phase`, `diagram-structure`
- `card-magnitude`, `card-structure-diagram`, `comparison-callout`, `metrics-row`, `control-rail`, `app-header`, `footer`

## Known nits / follow-up conventions

- **No localStorage / sessionStorage / indexedDB / cookies** anywhere. Theme is React state only; resets on reload.
- **Even vs odd N:** when the user picks an even N with linear-phase symmetric design, the windowed-sinc still produces a valid Type II filter (notch forced at Nyquist). The taps hint mentions this. We did not gate even N out — the hint educates instead.
- **Cutoff slider max** is bound to `fs/2 − 100 Hz`; if `fs` drops below current `fc`, an effect clamps `fc` back inside Nyquist.
- **Window function set:** Hamming / Blackman / Hann / Rectangular. Easy to add Kaiser later — add a `kaiserBeta` param and a `besseli0` helper inside `dsp.ts`.
- **Charts use viewBox + percent width**, so they scale fluidly. Mobile drops chart-wide labels naturally; if you want denser mobile, the only chart that gets cramped is the structure diagram — could add a horizontal scroll wrapper on `<lg` breakpoints.
- **Test IDs are stable** — when adding new metrics, prefer `metric-<keyword>` / `fpga-<keyword>` conventions to keep Playwright selectors predictable.
- **Sticky header artifact in Playwright `fullPage` screenshots** is a known Playwright quirk (the sticky element renders at multiple scroll positions during stitched screenshots); real-browser behavior is fine.

## QA evidence saved in workspace
- `qa-desktop-dark.png` — main dashboard, dark, balanced linear-phase preset
- `qa-desktop-light.png` — light theme (real PNG bytes confirmed `#F5F6F8` background)
- `qa-desktop-narrowband.png` — narrowband preset loaded, direct form, 104.9 dB stopband, fmax = low / routing = congested
- `qa-desktop-transposed.png` — same filter swapped to transposed form: LUTs drop 4726→940, FFs grow 5057→8492, fmax = high / routing = easy — exact pedagogical contrast.
- `qa-mobile-dark.png` — 390-px viewport, single-column stack

## Do not deploy
Parent agent will deploy. The build is verified; `dist/` is ready.
