import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";
import { StoreProvider } from "@/lib/store";

// System fonts only: the demo must not depend on downloading a web font.

export const metadata: Metadata = {
  title: "Millennium Signal",
  description: "Finds where Millennium Mutual's money is going and acts on it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
