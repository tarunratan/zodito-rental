import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Mirrors the CSS variables from your prototype
        primary: {
          DEFAULT: '#1a1a2e',
          dark: '#111118',
          soft: '#16213e',
        },
        accent: {
          DEFAULT: '#f97316',
          hover: '#fb923c',
          tint: '#fff8f5',
          ring: 'rgba(249,115,22,0.15)',
        },
        bg: {
          DEFAULT: '#f8f7f4',
        },
        muted: '#6b7280',
        border: '#e5e7eb',
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#d97706',
        info: '#2563eb',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 2px 16px rgba(0,0,0,0.07)',
        'card-hover': '0 8px 32px rgba(0,0,0,0.1)',
        hero: '0 8px 32px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
