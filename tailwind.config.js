/**
 * Design system shared with the Employee Portal.
 *
 * The palette is tuned for a dark, audit-ready surface:
 * - `ink`    — deep navy page background
 * - `surface`— dark glass card/panel surface
 * - `cream`  — warm off-white product cards
 * - `primary`— soft coral, the single accent colour
 *
 * The `neutral`, `primary`, `secondary`, `success`, `warning`, `error` and
 * `accent` scales are intentionally inverted (light steps are the *text*
 * colours, dark steps are the *background* colours) so existing markup such as
 * `text-neutral-900` / `bg-neutral-50` reads correctly on dark surfaces.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B1220',
          900: '#0F172A',
          850: '#131B2C',
          800: '#18213A',
          700: '#202B45',
          600: '#2A3654',
        },
        surface: '#121A2B',
        cream: {
          50: '#F8F5F0',
          100: '#F7F4EE',
          200: '#EDE7DC',
          300: '#DCD2C1',
          400: '#C3B49C',
          500: '#A8967C',
        },
        primary: {
          50: '#2A1A1D',
          100: '#3A2226',
          200: '#4E2C31',
          300: '#8E3F45',
          400: '#C24A4E',
          500: '#E85A5A',
          600: '#E85A5A',
          700: '#D64B4B',
          800: '#B23B3B',
          900: '#8E2F2F',
        },
        secondary: {
          50: '#161E33',
          100: '#1C2540',
          200: '#25314F',
          300: '#3A4A70',
          400: '#6B7DA6',
          500: '#8E9FC4',
          600: '#A9B7D6',
          700: '#C2CDE4',
          800: '#D8E0EF',
          900: '#EAF0F8',
        },
        accent: {
          50: '#241E14',
          100: '#302719',
          200: '#43361F',
          300: '#7A6431',
          400: '#B99A4E',
          500: '#D8B96B',
          600: '#E2C77F',
          700: '#EBD79F',
          800: '#F3E5C4',
          900: '#F9F0DC',
        },
        success: {
          50: '#14231B',
          100: '#1A2E22',
          200: '#24402F',
          300: '#37604A',
          400: '#5E8C6F',
          500: '#7BA88B',
          600: '#94BCA1',
          700: '#B0CFBA',
          800: '#CBE0D2',
          900: '#E4EFE8',
        },
        warning: {
          50: '#241C12',
          100: '#2F2517',
          200: '#443521',
          300: '#7A5F2F',
          400: '#B98F45',
          500: '#D6A85F',
          600: '#E0B979',
          700: '#EBCF9E',
          800: '#F3E2C3',
          900: '#F9F0DC',
        },
        error: {
          50: '#2A1618',
          100: '#3A1D1F',
          200: '#4E2629',
          300: '#8E3A3E',
          400: '#C2484C',
          500: '#E85A5A',
          600: '#EF6E6E',
          700: '#F3A0A0',
          800: '#F8C4C4',
          900: '#FBDCDC',
        },
        neutral: {
          50: '#131B2B',
          100: '#1B2438',
          200: '#263149',
          300: '#38445F',
          400: '#7C879F',
          500: '#98A2B8',
          600: '#B4BCCC',
          700: '#CDD3DF',
          800: '#E3E7EF',
          900: '#F5F7FB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: [
          'Iowan Old Style',
          'Palatino Linotype',
          'Palatino',
          'Book Antiqua',
          'Georgia',
          'Times New Roman',
          'serif',
        ],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0, 0, 0, 0.5), 0 1px 3px -1px rgba(0, 0, 0, 0.4)',
        card: '0 10px 30px -12px rgba(0, 0, 0, 0.7), 0 2px 6px -2px rgba(0, 0, 0, 0.5)',
        elevated: '0 24px 60px -20px rgba(0, 0, 0, 0.75), 0 8px 20px -8px rgba(0, 0, 0, 0.5)',
        cream: '0 28px 60px -24px rgba(0, 0, 0, 0.7), 0 12px 24px -14px rgba(0, 0, 0, 0.45)',
        glow: '0 14px 34px -12px rgba(232, 90, 90, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-12px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
