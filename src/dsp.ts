// FIR design + analysis utilities
// All math runs in browser. Windowed-sinc lowpass; FFT-based magnitude; quantization.

export type WindowType = 'hamming' | 'blackman' | 'rectangular' | 'hann';

export interface DesignParams {
  N: number;            // tap count
  fs: number;           // sample rate (Hz)
  fc: number;           // cutoff (Hz)
  window: WindowType;
  symmetric: boolean;   // enforce linear-phase symmetry (always true for windowed-sinc lowpass)
  coeffBits: number;    // coefficient word size in bits (signed)
}

// Window functions, length N (samples 0..N-1)
function windowValue(type: WindowType, n: number, N: number): number {
  const M = N - 1;
  switch (type) {
    case 'rectangular':
      return 1;
    case 'hann':
      return 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / M);
    case 'hamming':
      return 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / M);
    case 'blackman':
      return 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / M) + 0.08 * Math.cos((4 * Math.PI * n) / M);
  }
}

// Ideal sinc lowpass coefficients (continuous filter, windowed)
// fc is normalized cutoff = fc/fs (one-sided, 0..0.5)
export function designLowpass(p: DesignParams): { h: number[]; hq: number[]; quantStep: number; scale: number } {
  const { N, fs, fc, window } = p;
  const fcNorm = fc / fs; // 0..0.5
  const M = N - 1;
  const h: number[] = new Array(N);
  for (let n = 0; n < N; n++) {
    const k = n - M / 2;
    let s: number;
    if (Math.abs(k) < 1e-12) {
      s = 2 * fcNorm;
    } else {
      s = Math.sin(2 * Math.PI * fcNorm * k) / (Math.PI * k);
    }
    const w = windowValue(window, n, N);
    h[n] = s * w;
  }
  // Normalize DC gain to 1
  const dc = h.reduce((a, b) => a + b, 0);
  if (Math.abs(dc) > 1e-12) {
    for (let n = 0; n < N; n++) h[n] /= dc;
  }
  // Quantization: signed two's complement, coeffBits total bits (sign + fractional + integer).
  // We use full-scale = max(|h|), then scale to fit in (2^(B-1) - 1)
  const B = p.coeffBits;
  const fullScale = Math.max(...h.map((x) => Math.abs(x))) || 1;
  const maxInt = Math.pow(2, B - 1) - 1;
  const scale = maxInt / fullScale;
  const hq: number[] = h.map((x) => {
    const q = Math.round(x * scale);
    const clipped = Math.max(-maxInt - 1, Math.min(maxInt, q));
    return clipped / scale;
  });
  const quantStep = 1 / scale;
  return { h, hq, quantStep, scale };
}

// Compute frequency response H(e^{jw}) at K frequency points across [0, fs/2]
export function freqResponse(h: number[], K = 512): { freqNorm: number[]; magDb: number[]; phase: number[] } {
  const N = h.length;
  const freqNorm: number[] = new Array(K);
  const magDb: number[] = new Array(K);
  const phase: number[] = new Array(K);
  for (let k = 0; k < K; k++) {
    const w = (Math.PI * k) / (K - 1); // 0..pi
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      re += h[n] * Math.cos(w * n);
      im -= h[n] * Math.sin(w * n);
    }
    const mag = Math.sqrt(re * re + im * im);
    freqNorm[k] = k / (K - 1); // 0..1 represents 0..fs/2
    magDb[k] = 20 * Math.log10(Math.max(mag, 1e-12));
    phase[k] = Math.atan2(im, re);
  }
  return { freqNorm, magDb, phase };
}

export interface Metrics {
  passbandRippleDb: number; // peak-to-peak in passband
  stopbandAttDb: number;    // worst-case (least negative) magnitude in stopband
  transitionWidthHz: number;
  groupDelaySamples: number;
  quantSNRDb: number;
  quantRMSError: number;
  coeffPeak: number;
  coeffSum: number;
}

// Metrics from quantized magnitude response and impulse response
export function computeMetrics(
  hIdeal: number[],
  hQuant: number[],
  fs: number,
  fc: number,
  K = 1024
): Metrics {
  // Passband ripple = max|H|-min|H| in dB up to passband edge (0.85·fc)
  // Stopband attenuation = -max(H) for f >= 1.5·fc
  const resp = freqResponse(hQuant, K);

  // Identify nominal passband: 0 to fc/(fs/2)
  const fcNorm = fc / (fs / 2); // 0..1
  let passEnd = -1, stopStart = -1;
  for (let k = 0; k < K; k++) {
    const fnorm = k / (K - 1);
    if (fnorm <= fcNorm * 0.85) passEnd = k;
    if (stopStart < 0 && fnorm >= fcNorm * 1.5) stopStart = k;
  }
  if (stopStart < 0) stopStart = K - 1;

  // Passband ripple over [0, passEnd]
  let pbMax = -Infinity, pbMin = Infinity;
  for (let k = 0; k <= passEnd; k++) {
    if (resp.magDb[k] > pbMax) pbMax = resp.magDb[k];
    if (resp.magDb[k] < pbMin) pbMin = resp.magDb[k];
  }
  const passbandRippleDb = pbMax - pbMin;

  // Stopband attenuation (worst case after stopStart) — peak sidelobe
  let stopMax = -Infinity;
  for (let k = stopStart; k < K; k++) {
    if (resp.magDb[k] > stopMax) stopMax = resp.magDb[k];
  }
  const stopbandAttDb = -stopMax;

  // Transition width: from -3dB to -40dB crossings (or first sample below -40)
  let f3 = -1, f40 = -1;
  for (let k = 0; k < K; k++) {
    if (f3 < 0 && resp.magDb[k] <= -3) f3 = k;
    if (f40 < 0 && resp.magDb[k] <= -40) f40 = k;
  }
  if (f40 < 0) f40 = K - 1;
  if (f3 < 0) f3 = 0;
  const transitionWidthHz = ((f40 - f3) / (K - 1)) * (fs / 2);

  // Group delay (linear-phase symmetric): (N-1)/2 samples
  const groupDelaySamples = (hQuant.length - 1) / 2;

  // Quantization error: RMS of (hIdeal - hQuant), SNR vs signal power
  let sigPow = 0, errPow = 0;
  for (let n = 0; n < hIdeal.length; n++) {
    sigPow += hIdeal[n] * hIdeal[n];
    const e = hIdeal[n] - hQuant[n];
    errPow += e * e;
  }
  const quantRMSError = Math.sqrt(errPow / hIdeal.length);
  const quantSNRDb = 10 * Math.log10(sigPow / Math.max(errPow, 1e-30));

  const coeffPeak = Math.max(...hQuant.map((x) => Math.abs(x)));
  const coeffSum = hQuant.reduce((a, b) => a + b, 0);

  return {
    passbandRippleDb,
    stopbandAttDb,
    transitionWidthHz,
    groupDelaySamples,
    quantSNRDb,
    quantRMSError,
    coeffPeak,
    coeffSum,
  };
}

// Presets — return partial DesignParams
export type PresetKey =
  | 'balanced'
  | 'symmetric'
  | 'narrowband'
  | 'resource'
  | 'highquality';

export const PRESETS: Record<PresetKey, { label: string; tagline: string; params: Partial<DesignParams> }> = {
  balanced: {
    label: 'Balanced default',
    tagline: '64 taps · 16-bit · Hamming. Good teaching baseline.',
    params: { N: 64, coeffBits: 16, window: 'hamming' },
  },
  symmetric: {
    label: 'Symmetric linear-phase',
    tagline: 'Odd-length Hamming, flat group delay. Best symmetry savings.',
    params: { N: 65, coeffBits: 18, window: 'hamming' },
  },
  narrowband: {
    label: 'Narrowband / high-order',
    tagline: '192 taps · 20-bit · Blackman. Sharp transition, costly.',
    params: { N: 193, coeffBits: 20, window: 'blackman' },
  },
  resource: {
    label: 'Resource-constrained',
    tagline: '24 taps · 8-bit · Hamming. Minimal DSP/LUT footprint.',
    params: { N: 25, coeffBits: 8, window: 'hamming' },
  },
  highquality: {
    label: 'High-quality audio',
    tagline: '128 taps · 24-bit · Blackman. Studio-grade ripple/attenuation.',
    params: { N: 129, coeffBits: 24, window: 'blackman' },
  },
};
