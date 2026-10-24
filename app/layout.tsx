import type { Metadata } from "next";
import "./globals.css";
import { DeviceSync } from "@/components/device-sync";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Focus Tracker",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {capable:true,title:"Focus Tracker",statusBarStyle:"default"},
  description: "Plan your day, track focus sessions, and build your skills."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Header />
        <DeviceSync />
        {children}
      </body>
    </html>
  );
}
