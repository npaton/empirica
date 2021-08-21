const defaultTheme = require("tailwindcss/defaultTheme");
const {
  rose,
  pink,
  fuchsia,
  purple,
  violet,
  indigo,
  blue,
  sky,
  cyan,
  teal,
  emerald,
  green,
  lime,
  yellow,
  amber,
  orange,
  red,
  warmGray,
  trueGray,
  gray,
  coolGray,
  blueGray,
} = require("tailwindcss/colors");
const colors = {
  rose,
  pink,
  fuchsia,
  purple,
  violet,
  indigo,
  blue,
  sky,
  cyan,
  teal,
  emerald,
  green,
  lime,
  yellow,
  amber,
  orange,
  red,
  warmGray,
  trueGray,
  gray,
  coolGray,
  blueGray,
};

module.exports = {
  mode: "jit",
  purge: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/empirica/dist-src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontWeight: ["hover", "focus"],
      fontFamily: {
        sans: ["Inter var", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        ...colors,
        lightBlue: colors.sky,
        empirica: colors.trueGray,
        empirica: colors.coolGray,
        empirica: colors.warmGray,
        empirica: colors.gray,
        empirica: colors.blueGray,
        empirica: colors.amber,
        empirica: colors.blueGray,
      },
    },
  },
  variants: {},
  plugins: [require("@tailwindcss/forms")],
};
