import type { Metadata } from "next";
import { ClayWorld } from "@/components/clay-world";
import "./globals.css";
import "./preview.css";
import "./course.css";
import "./learning.css";
import "./compiler.css";
import "./assessment.css";
import "./clay.css";

export const metadata: Metadata = {
  title: "NovaLearn · Understanding, evidenced",
  description: "A professor-led course workspace connecting objectives, learning, authentic assessment, and evidence of understanding.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClayWorld />
        {children}
      </body>
    </html>
  );
}
