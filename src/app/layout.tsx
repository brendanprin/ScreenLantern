import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";

import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "ScreenLantern helps households search, save, and choose what to watch across streaming services.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${fraunces.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}

