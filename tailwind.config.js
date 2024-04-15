/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./{pages,components}/**/*.{js,tsx}'],
  theme: {
    extend: {
      height: {
        // Use dvh when able, falling back for old browsers.
        // fixes mobile screen height
        screen: ['100vh', '100dvh'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
