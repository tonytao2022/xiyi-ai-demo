/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "PingFang SC",
          "Microsoft YaHei",
          "Noto Sans SC",
          "Inter",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
