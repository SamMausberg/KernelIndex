import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from "next"
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { authConfigured } from "@/server/auth"
import { servingEnabled } from "@/server/env"
import "./globals.css"

// Self-hosted via next/font (§16.2). Instrument Sans is the UI voice; IBM
// Plex Mono is the data and identity face — a true monospace, so every
// latency, digest, and date is tabular by construction.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
})
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://kernelindex.com"),
  title: { default: "KernelIndex", template: "%s · KernelIndex" },
  description: "Find the fastest known GPU kernel for your exact workload.",
  alternates: {
    types: { "application/atom+xml": "/records/feed.xml" },
  },
  openGraph: { siteName: "KernelIndex", type: "website", url: "/" },
  twitter: { card: "summary_large_image" },
}

// Brand entity for search engines (§16.18): ties the "KernelIndex" name to
// this domain. Static facts only; inline is allowed by the CSP.
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "KernelIndex",
  url: "https://kernelindex.com",
  description:
    "The public performance index for GPU software: the fastest known GPU kernel for an exact workload, with source, license, protocol, and evidence.",
  publisher: {
    "@type": "Organization",
    name: "KernelIndex",
    url: "https://kernelindex.com",
    sameAs: ["https://github.com/SamMausberg/KernelIndex"],
  },
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${plexMono.variable}`}
    >
      {/* suppressHydrationWarning: extensions (Grammarly) mutate <body> attrs
          pre-hydration; React 19 treats that as a mismatch. Attrs only. */}
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON built above from literals
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        {/* §16.17: keyboard users skip the sticky header in one Tab. */}
        <a
          href="#main"
          className="sr-only z-[60] bg-canvas px-3 py-2 text-body focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <SiteHeader
          showServing={servingEnabled}
          authConfigured={authConfigured}
        />
        <div id="main">{children}</div>
        <SiteFooter />
        {/* Cookieless page-view counts (same-origin /_vercel/insights, so
            the CSP needs no change); disclosed under /docs#privacy. */}
        <Analytics />
      </body>
    </html>
  )
}
