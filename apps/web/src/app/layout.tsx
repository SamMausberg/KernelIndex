import type { Metadata } from "next"
import { Instrument_Sans, Space_Grotesk } from "next/font/google"
import "./globals.css"

// Self-hosted via next/font (§16.2); exposed as variables so the token
// stacks in globals.css can prefer ABC Diatype when it is available.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
})
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://kernelindex.com"),
  title: { default: "KernelIndex", template: "%s — KernelIndex" },
  description: "Find the fastest verified GPU kernel for your exact workload.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${spaceGrotesk.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
