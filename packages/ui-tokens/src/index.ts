/**
 * Legacy production UI tokens.
 *
 * Keep these exports until the currently mounted production surfaces have
 * migrated. New Sunlit work must use the scoped variables in
 * `apps/web/app/sunlit-theme.css` instead of extending this palette.
 */
export const colors = {
  navy: "#1A1A2E",
  midnavy: "#0F3460",
  accent: "#E94560",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  border: "#D8DEE9",
  text: "#1A1A2E",
  muted: "#5A6072",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444"
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64
} as const;

export const radii = {
  button: 6,
  input: 8,
  card: 12,
  pill: 999
} as const;

export const typography = {
  fontFamily: "Inter",
  displayFamily: "Inter",
  sizes: {
    caption: 12,
    body: 14,
    bodyLg: 16,
    h3: 18,
    h2: 22,
    h1: 28,
    display: 36
  }
} as const;

export const elevation = {
  e1: "0 1px 2px rgba(16,24,40,.06)",
  e2: "0 4px 12px rgba(16,24,40,.10)",
  e3: "0 16px 40px rgba(16,24,40,.16)"
} as const;
