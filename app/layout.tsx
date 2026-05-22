import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNSim — Interactive UN Policy Simulation",
  description:
    "Simulate how 193 member states debate and vote on UN resolutions. Powered by real voting data, knowledge graphs, and AI-driven diplomacy.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
