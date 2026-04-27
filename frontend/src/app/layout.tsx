import type { Metadata } from "next";
import type { Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plugin AI — Intelligent RAG Platform",
  description: "Upload your documents, build AI workspaces, and deploy intelligent support assistants.",
  icons: {
    icon: [
      { url: '/PluginAi-Icon.png', type: 'image/png' },
    ],
    shortcut: '/PluginAi-Icon.png',
    apple: '/PluginAi-Icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
