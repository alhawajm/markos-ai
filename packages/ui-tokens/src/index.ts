/**
 * Semantic UI tokens. The exact light and dark palettes live in
 * `apps/web/app/theme-tokens.css`; these exports follow the selected theme.
 */
export const colors = {
  navy: "var(--text)",
  midnavy: "var(--text-soft)",
  primary: "var(--primary)",
  secondary: "var(--secondary)",
  accent: "var(--accent)",
  bg: "var(--background)",
  card: "var(--surface)",
  border: "var(--border)",
  text: "var(--text)",
  muted: "var(--muted)",
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--danger)"
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
  fontFamily: "var(--font-ui)",
  displayFamily: "var(--font-ui)",
  sizes: {
    caption: 13,
    body: 16,
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
