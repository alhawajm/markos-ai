import { useAppearance } from "../providers";

// Light values are from the team's 390 × 844 Figma frames. Dark mode uses
// the app's semantic tokens until the corresponding designs are supplied.
export const postFlowLight = {
  canvas: "#FDFDFD",
  title: "#30383D",
  ink: "#303B43",
  muted: "#606D78",
  nav: "#F2F2F7",
  card: "#F0F0F0",
  user: "#DAF1F8",
  action: "#E1EFDF",
  selection: "#428691",
  editSelection: "#6FE2E0",
  yellow: "#E7D033",
  cyan: "#34D8FF"
} as const;

export function usePostFlowTheme() {
  const { mode, colors } = useAppearance();
  return mode === "light"
    ? postFlowLight
    : {
        ...postFlowLight,
        canvas: colors.background,
        title: colors.text,
        ink: colors.text,
        muted: colors.muted,
        nav: colors.surface,
        card: colors.surfaceRaised,
        user: colors.accentSoft,
        action: colors.primarySoft,
        selection: colors.focus
      };
}
