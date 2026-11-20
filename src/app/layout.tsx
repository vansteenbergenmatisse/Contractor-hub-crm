import type { ReactNode } from "react";

export const metadata = { title: "Contractor Hub CRM" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
