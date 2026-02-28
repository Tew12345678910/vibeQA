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
  title: "BrowserQA Studio",
  description: "QA dashboard for suites, runs, issues, and cloud audit monitoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} min-h-screen bg-background text-foreground antialiased`}>
        <TooltipProvider>
          <AppChrome>{children}</AppChrome>
        </TooltipProvider>
      </body>
    </html>
  );
}
