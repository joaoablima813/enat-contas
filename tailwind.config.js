/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        enat: {
          headerBg: '#4B5C92', headerText: '#FFFFFF', titleText: '#2F395D',
          kpiBg: '#F1F4FA', kpiLabel: '#59607F', kpiValue: '#191E3D',
          rowZebra: '#F6F7FB', border: '#E2E6F0',
          statusPlanningBg: '#E8ECFF', statusPlanningText: '#3B4EAF',
          statusProgressBg: '#FEF3C7', statusProgressText: '#92400E',
          statusCompletedBg: '#D1FAE5', statusCompletedText: '#065F46',
          statusPausedBg: '#FEE2E2', statusPausedText: '#991B1B',
          paidBg: '#DCFCE7', paidText: '#15803D', partialBg: '#FEF9C3',
          partialText: '#854D0E', pendingBg: '#FEE2E2', pendingText: '#B91C1C',
        },
      },
      fontFamily: { sans: ['"Google Sans"', 'Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
