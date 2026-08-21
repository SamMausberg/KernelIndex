// Post-deploy warm (§19): ISR pages serve the previous deployment's HTML
// until their first revalidation, so a crawl right after a deploy sees mixed
// build ids. This fetches every key route twice (the first hit triggers
// revalidation, the second reads the fresh copy) and prints the rev hash the
// footer reports. Usage: node scripts/warm.mjs https://kernelindex.com
const origin = process.argv[2] ?? "https://kernelindex.com"
const routes = [
  "/",
  "/search",
  "/records",
  "/serving",
  "/gpus",
  "/implementations",
  "/docs",
  "/docs/api",
  "/submit",
  "/legal",
  // Island payloads are CDN-cached too; a stale model must not lag the
  // freshly warmed SSR slice.
  "/records/data",
  "/suggest",
]

const rev = (html) => html.match(/([0-9a-f]{7})<\//)?.[1] ?? "?"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const route of routes) {
  await fetch(origin + route).catch(() => {})
}

// Dynamic ISR pages (operations, GPUs) also carry the previous deployment
// until their first revalidation; the sitemap enumerates them all. One
// fetch each triggers revalidation — a bounded concurrent sweep.
const sitemap = await fetch(`${origin}/sitemap.xml`)
  .then((response) => response.text())
  .catch(() => "")
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => !routes.includes(new URL(url).pathname))
let swept = 0
for (let index = 0; index < urls.length; index += 8) {
  await Promise.all(
    urls.slice(index, index + 8).map((url) =>
      fetch(url)
        .then((response) => {
          if (response.ok) swept += 1
        })
        .catch(() => {}),
    ),
  )
}
console.log(`swept ${swept}/${urls.length} sitemap pages`)

await sleep(3000)
let failed = false
for (const route of routes) {
  const response = await fetch(origin + route)
  const hash = rev(await response.text())
  if (!response.ok) failed = true
  console.log(`${response.status} ${hash}  ${route}`)
}
process.exit(failed ? 1 : 0)
