import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "claude-code-time",
  description:
    "Idle-aware time tracking for Claude Code — see how long you and Claude actually worked, per project, per day, per session.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
