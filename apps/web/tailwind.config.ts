import type { Config } from "tailwindcss";

// Brand: #8B4FA8 (CLAUDE.md). Headings use Bricolage Grotesque, body uses
// Plus Jakarta Sans — both loaded via next/font/google in app/layout.tsx and
// exposed as CSS variables here.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#8B4FA8",
          50: "#F5EEF9",
          100: "#E9DCF3",
          200: "#D3B9E7",
          300: "#BD96DB",
          400: "#A773CF",
          500: "#8B4FA8",
          600: "#733F8A",
          700: "#5A306C",
          800: "#41224E",
          900: "#291330"
        }
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
