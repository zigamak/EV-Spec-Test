import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Reference-direction typefaces (design-system/tokens.provisional.css) —
// next/font self-hosts + subsets these at build time, no runtime Google
// Fonts request. Exposed as CSS variables so tokens.provisional.css can
// reference them the same way plain CSS would.
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
    <html lang="en" className={`${playfairDisplay.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
