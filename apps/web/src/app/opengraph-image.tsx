// Site-wide social card (§16.18): the wordmark and promise on the matte
// canvas, drawn by the shared card renderer every dossier also uses. Also
// the twitter:image via the metadata route convention.
import { OG_SIZE, ogCard } from "@/features/og/card"

export const alt = "KernelIndex: the public performance index for GPU software"
export const size = OG_SIZE
export const contentType = "image/png"

export default function Image() {
  return ogCard({
    eyebrow: "the public performance index for GPU software",
    title: "KernelIndex",
    lead: "Find the fastest known GPU kernel for your exact workload.",
    fraction: 0.65,
    footer: "Ranked only against runs that measured the same thing.",
  })
}
