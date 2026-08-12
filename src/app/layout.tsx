import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import PwaServiceWorker from "@/components/crm-boilerplate/PwaServiceWorker";
import PerformanceVitals from "@/components/crm-boilerplate/PerformanceVitals";
import { ToastProvider } from "@/components/crm-boilerplate/ToastProvider";

const outfit = Outfit({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "iD30 CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iD30 CRM",
  },
  description: "Installable iD30 CRM workspace for sales, marketing and client operations.",
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/images/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
  title: {
    default: "iD30 CRM",
    template: "%s | iD30 CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#101828",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <ToastProvider>
            <PwaServiceWorker />
            <PerformanceVitals />
            <SidebarProvider>{children}</SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
