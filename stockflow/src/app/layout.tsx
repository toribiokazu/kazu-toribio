import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
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
            <div className="flex min-w-0 flex-1 flex-col">
              <TopNav />
              <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
