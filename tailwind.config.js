/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        premium: '0 18px 40px rgba(15, 23, 42, 0.08)',
        soft: '0 8px 24px rgba(15, 23, 42, 0.06)'
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.65' },
          '50%': { opacity: '1' }
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        }
      },
      animation: {
        pulseSoft: 'pulseSoft 1.6s ease-in-out infinite',
        slideDown: 'slideDown 220ms ease-out'
      }
    }
  },
  plugins: []
}
