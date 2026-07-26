import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EHR Consolidation Review",
  description:
    "Review transcript-driven notifications and apply suggested edits to the EHR.",
};

// Set the theme before first paint to avoid a flash of the wrong theme.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
