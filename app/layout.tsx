import type { Metadata } from "next";

import "~/app.css";

export const metadata: Metadata = {
  title: "Review desk | Creator Army",
  description: "Review creator submissions for active campaigns.",
  icons: { icon: "/favicon.svg" },
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
