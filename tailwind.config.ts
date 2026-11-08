import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        canvas: "#f5f7fb",
        forest: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554"
        },
        amberx: "#d68b2d"
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 10px 32px rgba(30,64,175,.045)",
        float: "0 18px 60px rgba(23,37,84,.16)"
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem"
      },
      fontFamily: {
        sans: ["Inter", "Aptos", "Segoe UI", "sans-serif"],
        display: ["Manrope", "Inter", "Aptos", "sans-serif"]
      }
    }
  },
  plugins: [forms]
} satisfies Config;
