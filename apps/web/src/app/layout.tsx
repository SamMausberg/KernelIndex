import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "KernelIndex",
  description: "Find the fastest verified GPU kernel for your exact workload.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
