import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeSync } from "./_components/theme-control";
import { themeInitializationScript } from "./theme";
import { plexArabic, plexSans } from "./fonts";
import "./globals.css";
import "./sunlit-theme.css";

export const metadata: Metadata = {
  title: "MARKOS AI",
  description: "AI-powered marketing operating system"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${plexSans.variable} ${plexArabic.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
