// The feed (§13.11): ISR — the server renders the public feed from CDN
// cache; the island applies a deep-linked "Following" view after hydration
// through the session-authorized data route. Sessions never make this page
// dynamic.
import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { FeedView } from "@/features/feed/feed-view"
import { getFeed } from "@/lib/catalog"

export const metadata: Metadata = {
  title: "Feed",
  description:
    "What KernelIndex learned over the trailing 30 days: record breaks, publication batches, corrections, and accepted project claims.",
  alternates: { canonical: "/feed" },
}
export const revalidate = 3600

export default async function FeedPage() {
  const model = await getFeed()
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <FeedView initial={model} />
    </>
  )
}
