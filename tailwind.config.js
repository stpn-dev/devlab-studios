/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{astro,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          ink: '#121739',
          teal: '#2f3cff',
          mint: '#eef1ff',
          orange: '#2f3cff',
          orangeDark: '#202cc2',
          shell: '#f5f7fa',
        },
        navy: {
          50: '#e8edff',
          100: '#cfd9ff',
          200: '#a3b8ff',
          300: '#7594fb',
          400: '#4d72ef',
          500: '#3055d6',
          600: '#1f3fa6',
          700: '#193480',
          800: '#152b66',
          900: '#11214d',
          950: '#0b1b34',
        },
        ink: '#0b1426',
        mist: '#b5c4e1',
      },
      boxShadow: {
        glass: '0 20px 50px rgba(10, 22, 53, 0.35)',
      },
      backdropBlur: {
        18: '18px',
      },
    },
  },
  plugins: [],
}

