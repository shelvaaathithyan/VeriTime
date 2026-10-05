/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#102A43',
          50: '#F5F9FC',
          100: '#EAF3FA',
          200: '#C9DFF1',
          300: '#A3C8E5',
          400: '#5B9FCC',
          500: '#2D7BB6',
          600: '#1769AA',
          700: '#145C95',
          800: '#0E4270',
          900: '#102A43',
        },
        text: {
          primary: '#172B4D',
          secondary: '#52606D',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
