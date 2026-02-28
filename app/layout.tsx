import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus Tracker SaaS",
  description: "A clean starting point for a focus-tracking SaaS app."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
