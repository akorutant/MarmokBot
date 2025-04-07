/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,html}",
    "./services/logServer/views/**/*.ejs"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8'
        },
        secondary: {
          DEFAULT: '#4f46e5',
          dark: '#4338ca'
        }
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      }
    },
  },
  darkMode: 'class',
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ],
}

module.exports = {
  content: [
    "./services/logServer/views/**/*.ejs",
    "./services/logServer/public/js/**/*.js"
  ],
  theme: {
    extend: {
      spacing: {
        '128': '32rem'
      },
      fontFamily: {
        mono: ['Fira Code', 'monospace']
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
}