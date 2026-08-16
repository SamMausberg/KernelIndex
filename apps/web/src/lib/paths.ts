/** Open-redirect guard for post-sign-in return paths (§18): only a
 * same-site absolute path survives — anything protocol-relative (`//`,
 * `/\`), scheme-carrying, or relative is discarded in favor of /account. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || !/^\/(?![/\\])/.test(raw)) return "/account"
  return raw
}
