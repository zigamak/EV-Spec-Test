import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

// Reference-direction typefaces (design-system/tokens.provisional.css) —
// next/font self-hosts + subsets these at build time, no runtime Google
// Fonts request. Exposed as CSS variables so tokens.provisional.css can
// reference them the same way plain CSS would. Cormorant Garamond per the
// Operator Console design brief (18 Jul), incl. italic for editorial
// accent words in headings; not a variable font, so weights are explicit.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Exclusive Venue Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
