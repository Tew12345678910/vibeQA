import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { AppChrome } from "@/components/AppChrome";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeQA — The QA Education Layer for AI-Assisted Development",
  description:
    "VibeQA runs two AI agents on every scan — one reads your source code, one operates a real browser on your live site — then explains exactly what's wrong and teaches you why it matters.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <TooltipProvider>
          <AppChrome>{children}</AppChrome>
        </TooltipProvider>
      </body>
    </html>
  );
}
