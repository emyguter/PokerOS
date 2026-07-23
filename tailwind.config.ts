import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface:  '#0C0E0B',
        surface2: '#111510',
        surface3: '#1A2A1A',
        gold:     '#C9A84C',
        ivory:    '#F0EDE4',
        felt:     '#1A2A1A',
        success:  '#7DC97D',
        alert:    '#E07070',
        purple:   '#AFA9EC',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
