// The Coverage page's content moved with the C-phase consolidation: source
// health lives in docs#sources and the homepage trust block, the priority
// grid on /gpus. Old links land on the closest heir.
import { permanentRedirect } from "next/navigation"

export function GET(): never {
  permanentRedirect("/docs#sources")
}
