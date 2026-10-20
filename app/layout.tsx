import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Unfamous Years",
  description:
    "Small, unglamorous attempts count, whether or not they lead anywhere. Read some, then go try something.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              Unfamous Years
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Stories</Link>
              <Link href="/submit">Share an attempt</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="wrap">
            Small attempts count, whether or not they lead anywhere.
          </div>
        </footer>
      </body>
    </html>
  );
}
