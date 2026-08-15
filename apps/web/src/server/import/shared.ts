// Normalization helpers shared by importers (§14.7): slug casing, timestamp
// normalization, and the tiny derived-axis expression grammar (§9.1).

export function kebab(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 100)
}

/** Source timestamps may lack a timezone; they are UTC by convention. */
export function toUtcInstant(value: string): string {
  const withZone = /(z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`
  const parsed = new Date(withZone)
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`unparseable timestamp: ${value}`)
  return parsed.toISOString()
}

/**
 * Evaluate a derived-axis expression from the tiny grammar (§9.1): integers,
 * axis names, + - * %, floor division (//), and parentheses.
 */
export function evaluateAxisExpression(
  expression: string,
  bindings: Record<string, number>,
): number {
  const tokens = expression.match(/\d+|[a-z_][a-z0-9_]*|\/\/|[+\-*%()]/g) ?? []
  let position = 0
  const peek = () => tokens[position]
  const next = () => tokens[position++]
  const factor = (): number => {
    const token = next()
    if (token === undefined)
      throw new Error(`unexpected end of '${expression}'`)
    if (token === "(") {
      const value = sum()
      if (next() !== ")") throw new Error(`missing ')' in '${expression}'`)
      return value
    }
    if (/^\d+$/.test(token)) return Number(token)
    const bound = bindings[token]
    if (bound === undefined)
      throw new Error(`unbound axis '${token}' in '${expression}'`)
    return bound
  }
  const product = (): number => {
    let value = factor()
    while (peek() === "*" || peek() === "//" || peek() === "%") {
      const op = next()
      const rhs = factor()
      value =
        op === "*"
          ? value * rhs
          : op === "%"
            ? value % rhs
            : Math.floor(value / rhs)
    }
    return value
  }
  const sum = (): number => {
    let value = product()
    while (peek() === "+" || peek() === "-") {
      const op = next()
      const rhs = product()
      value = op === "+" ? value + rhs : value - rhs
    }
    return value
  }
  const result = sum()
  if (position !== tokens.length)
    throw new Error(`trailing tokens in '${expression}'`)
  return result
}
