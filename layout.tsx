import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from "@/components/site/site-shell";

export const metadata: Metadata = {
  title: "WOWSTER LIVE",
  description: "Live paint-along school and guest streams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
