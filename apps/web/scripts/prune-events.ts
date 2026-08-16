// §20.5 retention: product events are kept 90 days, then pruned. Run
// weekly by the import workflow; also safe to run by hand.
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to prune product events.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const pruned = await client`
  delete from product_events where created_at < now() - interval '90 days'`
await client.end()
console.log(`product events pruned: ${pruned.count}`)
