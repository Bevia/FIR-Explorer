// FPGA resource estimator — heuristic, architecture-aware.
// Estimates target a mid-range Xilinx 7-series / Artix UltraScale style device,
// DSP48E1/E2 slices supporting 25x18 signed multiply with pre-adder.

export type Structure = 'direct' | 'transposed';

export interface FpgaInputs {
  N: number;
  coeffBits: number;
  dataBits: number;    // assumed input sample width (default 16)
  structure: Structure;
  symmetric: boolean;  // linear-phase savings
}

export interface FpgaEstimate {
  dspSlices: number;
  luts: number;
  ffs: number;
  bramKbits: number;
  latencyCycles: number;
  fmaxQual: 'high' | 'medium' | 'low';
  routingQual: 'easy' | 'moderate' | 'congested';
  notes: string[];
  uniqueMultipliers: number;
  delayTaps: number;
  accumulatorBits: number;
}

// DSP48 supports up to 25x18 signed; if coeff width > 18 or data > 25, use 2 DSPs per multiply
function dspsPerMultiply(coeffBits: number, dataBits: number): number {
  const a = coeffBits;
  const b = dataBits;
  if (a <= 18 && b <= 25) return 1;
  if (a <= 35 && b <= 25) return 2;
  if (a <= 18 && b <= 48) return 2;
  return 4;
}

export function estimateFpga(inp: FpgaInputs): FpgaEstimate {
  const { N, coeffBits, dataBits, structure, symmetric } = inp;
  const notes: string[] = [];

  // Unique multipliers for symmetric linear-phase: ceil(N/2)
  const uniqueMults = symmetric ? Math.ceil(N / 2) : N;
  const perMul = dspsPerMultiply(coeffBits, dataBits);
  const dspSlices = uniqueMults * perMul;

  // Accumulator output width
  const accumBits = coeffBits + dataBits + Math.ceil(Math.log2(N));

  // Delay line / registers
  // Direct form: tapped delay line of (N-1) data registers, width = dataBits.
  // Transposed: (N-1) accumulator registers, width = accumBits (wider!).
  let ffs: number;
  let delayTaps: number;
  if (structure === 'direct') {
    delayTaps = N - 1;
    // If symmetric, pre-adders fold the delay line (still need N-1 stages, but adders halve down)
    ffs = (N - 1) * dataBits + (symmetric ? Math.ceil(N / 2) * (dataBits + 1) : 0);
    // Plus pipeline registers for adder tree (log2 stages)
    const adderStages = Math.ceil(Math.log2(uniqueMults));
    ffs += adderStages * (accumBits + 4);
  } else {
    // transposed
    delayTaps = N - 1;
    // Each tap has an accumulator register at full width
    ffs = (N - 1) * accumBits + accumBits;
    // input fan-out is broadcast, no input delay line needed in pure transposed
  }

  // LUTs — heuristic
  // Direct form: needs adder tree if not using DSP cascade. We assume DSP cascade for the multiplies,
  //   but symmetric pre-adders + post-add tree consume LUTs.
  // Transposed: minimal extra LUTs; everything stays in DSPs and registers.
  let luts: number;
  if (structure === 'direct') {
    // Pre-adder for symmetry: 1 wide adder per pair (already free in DSP48 pre-adder if width fits)
    const preAdderLUTs = symmetric ? Math.ceil(N / 2) * Math.max(0, dataBits - 18) * 1.2 : 0;
    // Adder tree summing uniqueMults products → ~2 LUTs per accumBit per uniqueMult/2
    const treeLUTs = (uniqueMults - 1) * accumBits * 1.1;
    luts = Math.round(preAdderLUTs + treeLUTs + 80);
  } else {
    // Transposed: per-tap adder, but DSP48 has built-in P-cascade accumulator → very LUT-light.
    luts = Math.round(N * 4 + accumBits * 2 + 80);
  }

  // BRAM — not generally needed for short FIR; if N > 256 in transposed/coefficient ROM scheme, 1 BRAM block
  let bramKbits = 0;
  if (N >= 256) {
    bramKbits = Math.ceil((N * coeffBits) / 18000) * 18; // 18-Kb blocks
  }

  // Latency:
  // Direct form (pipelined): mult (1) + log2(uniqueMults) adder tree + output reg.
  // Transposed: DSP48 cascade pipeline = N stages of MAC, latency ~ N + a couple cycles.
  let latencyCycles: number;
  if (structure === 'direct') {
    latencyCycles = 1 + Math.ceil(Math.log2(Math.max(uniqueMults, 2))) + 1 + (symmetric ? 1 : 0);
  } else {
    latencyCycles = N + 3;
  }

  // fmax/routing qualitative
  let fmaxQual: 'high' | 'medium' | 'low';
  let routingQual: 'easy' | 'moderate' | 'congested';
  if (structure === 'transposed') {
    fmaxQual = N > 200 ? 'medium' : 'high';
    routingQual = N > 256 ? 'moderate' : 'easy';
    notes.push('Transposed: each tap is a self-contained MAC with a local register. Maps cleanly onto DSP48 P-cascade, so timing closure is straightforward even at high tap counts.');
    notes.push('Input broadcast to all taps creates high fan-out — synthesis tools typically replicate the input register automatically.');
  } else {
    // direct form
    if (N <= 32) { fmaxQual = 'high'; routingQual = 'easy'; }
    else if (N <= 96) { fmaxQual = 'medium'; routingQual = 'moderate'; }
    else { fmaxQual = 'low'; routingQual = 'congested'; }
    notes.push('Direct form: long adder tree summing all products. As N grows, the tree depth grows like log2(N) — pipelining is mandatory above ~32 taps for high fmax.');
    notes.push('Tapped delay line is compact (data width only), but the post-adder tree dominates routing. Linear-phase symmetry halves the multiplier count via pre-adders.');
  }
  if (symmetric) {
    notes.push(`Linear-phase symmetry exploited: only ${uniqueMults} unique multipliers (vs ${N}). DSP48 pre-adder absorbs the symmetric pair sum at no cost when data ≤ 25 bits.`);
  }
  if (coeffBits > 18) {
    notes.push(`Coefficient width ${coeffBits} bits exceeds DSP48 18-bit B-port — each multiply uses ${perMul} DSP slices.`);
  }
  if (N >= 256) {
    notes.push('Tap count ≥ 256: coefficients may be stored in BRAM with a time-multiplexed MAC engine for area savings (not modeled in cycle latency above).');
  }

  return {
    dspSlices,
    luts,
    ffs,
    bramKbits,
    latencyCycles,
    fmaxQual,
    routingQual,
    notes,
    uniqueMultipliers: uniqueMults,
    delayTaps,
    accumulatorBits: accumBits,
  };
}
