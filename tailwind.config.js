/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Pitch-inspired brand palette (Givetour/Sofascore-adjacent)
        primary: {
          50: '#eafbf1',
          100: '#c9f3da',
          200: '#94e7b8',
          300: '#5cd696',
          400: '#2ec27b',
          500: '#0fa863', // brand green
          600: '#0b8a51',
          700: '#0a6d41',
          800: '#0a5735',
          900: '#09482c',
        },
        surface: {
          light: '#ffffff',
          muted: '#f4f6f8',
          dark: '#0f1720',
          darkMuted: '#182430',
        },
        accent: {
          amber: '#f5a623',
          red: '#e5484d',
          blue: '#3b82f6',
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'bottom-nav': '64px',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,32,0.06), 0 1px 1px rgba(16,24,32,0.04)',
        'nav-top': '0 -1px 6px rgba(16,24,32,0.08)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
