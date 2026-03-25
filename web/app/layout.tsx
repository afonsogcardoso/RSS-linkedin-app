import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "LinkedIn RSS Dashboard",
  description:
    "A premium dashboard for exploring LinkedIn posts from the repository RSS feed."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "font-sans text-foreground"
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-hero-radial opacity-90" />
            <div className="relative">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
