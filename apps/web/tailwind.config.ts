import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        'premium': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 0 3px rgba(0,0,0,0.02)',
        'float': '0 10px 40px -10px rgba(0,0,0,0.08)',
        'sheet': '0 -10px 40px -10px rgba(0,0,0,0.1)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      colors: {
        brand: {
          light: '#e8f0fe',
          DEFAULT: '#0056D2',
          dark: '#003889',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8fafc', // slate-50
          dark: '#f1f5f9', // slate-100
        },
        primary: {
          50: '#e8f0fe',
          100: '#c6d9fd',
          200: '#9ec0fb',
          300: '#6ea5f8',
          400: '#3d88f5',
          500: '#0066ff',
          600: '#0056D2',
          700: '#0047ad',
          800: '#003889',
          900: '#002a66',
        },
        accent: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        outfit: ['var(--font-outfit)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
