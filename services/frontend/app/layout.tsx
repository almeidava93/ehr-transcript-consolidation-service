import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EHR × Transcript Simulator",
  description:
    "Upload EHR data and a transcript, then watch notifications generate as each transcript span is processed.",
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
