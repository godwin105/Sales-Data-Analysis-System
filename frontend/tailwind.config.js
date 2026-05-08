/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  // Use class-based dark mode so our ThemeContext can toggle it
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand palette ported from the original style.css
        navy: {
          DEFAULT: '#0F172A',
          light: '#1E293B',
        },
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        success: '#16A34A',
        warning: '#F59E0B',
        danger:  '#DC2626',
      },
      boxShadow: {
        soft: '0 1px 4px rgba(0,0,0,0.07)',
        'soft-dark': '0 1px 4px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
