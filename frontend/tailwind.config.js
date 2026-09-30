/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        logo: ["Silkscreen", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          DEFAULT: "#0B9B3F",
          hover: "#088535",
          soft: "#E8F5EC",
          softer: "#F1F9F3",
        },
        ink: {
          DEFAULT: "#1F1F1F",
          muted: "#6B6B6B",
          faint: "#9A9A9A",
        },
        line: "#EDEDED",
        surface: "#F7F7F7",
        warn: { DEFAULT: "#C2570C", soft: "#FFF1E5", line: "#F8C9A0" },
        danger: { DEFAULT: "#C62828", soft: "#FDECEC" },
      },
      boxShadow: {
        pop: "0 8px 30px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
