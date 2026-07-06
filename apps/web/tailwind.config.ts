import type { Config } from "tailwindcss";
import { colors, radii, typography } from "@markos/ui-tokens";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [typography.fontFamily, "ui-sans-serif", "system-ui", "sans-serif"],
        display: [typography.displayFamily, typography.fontFamily, "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        navy: colors.navy,
        midnavy: colors.midnavy,
        accent: colors.accent,
        canvas: colors.bg,
        card: colors.card,
        border: colors.border,
        muted: colors.muted,
        success: colors.success,
        warning: colors.warning,
        destructive: colors.error
      },
      borderRadius: {
        button: `${radii.button}px`,
        input: `${radii.input}px`,
        card: `${radii.card}px`
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06)"
      }
    }
  },
  plugins: []
};

export default config;
