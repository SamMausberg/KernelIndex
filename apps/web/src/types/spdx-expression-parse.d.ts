declare module "spdx-expression-parse" {
  type SpdxNode =
    | { license: string; plus?: boolean; exception?: string }
    | { conjunction: "and" | "or"; left: SpdxNode; right: SpdxNode }
  export default function parse(expression: string): SpdxNode
}
