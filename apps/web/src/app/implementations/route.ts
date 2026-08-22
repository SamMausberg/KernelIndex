// The projects index moved to /projects (the URL now says what the footer
// says); implementation dossiers keep living under /implementations/[slug].
import { permanentRedirect } from "next/navigation"

export function GET(): never {
  permanentRedirect("/projects")
}
