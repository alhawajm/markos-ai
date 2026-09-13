import type { Config } from "tailwindcss";
import { colors, radii, typography } from "@markos/ui-tokens";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.45" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.55" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.25rem", { lineHeight: "1.4" }],
        "2xl": ["1.5rem", { lineHeight: "1.3" }],
        "3xl": ["1.75rem", { lineHeight: "1.25" }],
        "4xl": ["2.125rem", { lineHeight: "1.2" }]
      },
      fontWeight: { extrabold: "700", black: "700" },
      fontFamily: {
        sans: [typography.fontFamily, "ui-sans-serif", "system-ui", "sans-serif"],
        display: [typography.displayFamily, typography.fontFamily, "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
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
        card: "var(--shadow-sm)"
      }
    }
  },
  plugins: []
};

export default config;
