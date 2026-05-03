import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TRADING HUD",
  description: "Funded account dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* Content lives above all background layers via z-10. The animated
            grid + radial HUD + scanlines paint at z-index 0 from globals.css
            pseudo-elements, so anything z-10 or above is guaranteed visible. */}
        <div className="relative z-10 mx-auto max-w-[1400px] px-6 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}
