import type { Metadata, Viewport } from "next";
import "./globals.css";
import { initScheduler } from "@/lib/scheduler";

if (typeof window === "undefined") {
  initScheduler();
}

export const metadata: Metadata = {
  title: "Football Tips & Bankroll",
  description: "AI-powered daily match insights",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#050b18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#040812] text-white antialiased">{children}</body>
    </html>
  );
}