/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        // Engineering instrument palette — graphite + cyan + amber
        bg: {
          DEFAULT: '#0B0E12',
          alt: '#0F141A',
          surface: '#141A22',
          raised: '#1A222C',
        },
        line: {
          DEFAULT: '#222C38',
          strong: '#2E3A48',
        },
        ink: {
          DEFAULT: '#E7ECF2',
          muted: '#8C97A6',
          faint: '#566273',
        },
        // Accent: cyan = signal trace, amber = warning/quantization, magenta = stopband
        accent: {
          DEFAULT: '#22D3EE', // cyan-400
          dim: '#0E9FB5',
          warm: '#F5A524',
          mag: '#E879A6',
          green: '#5DCC8A',
        },
        // Light mode parity
        lbg: {
          DEFAULT: '#F5F6F8',
          alt: '#EDEFF3',
          surface: '#FFFFFF',
          raised: '#FAFBFC',
        },
        lline: {
          DEFAULT: '#D6DAE0',
          strong: '#B7BEC8',
        },
        link: {
          DEFAULT: '#0E1116',
          muted: '#5A6473',
          faint: '#8C95A2',
        },
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};
