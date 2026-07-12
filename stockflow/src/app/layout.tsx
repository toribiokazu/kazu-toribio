import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "StockFlow",
  description: "API-first inventory management with flexible webhooks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
