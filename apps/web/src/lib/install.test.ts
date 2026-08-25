import { describe, expect, it } from "vitest"
import { installIsPinned, pinPipCommand } from "./install.ts"

describe("installIsPinned", () => {
  it("recognizes pinned and unpinned forms per kind", () => {
    expect(installIsPinned("pip", 'pip install "liger-kernel==0.6.2"')).toBe(
      true,
    )
    expect(installIsPinned("pip", "pip install liger-kernel")).toBe(false)
    expect(
      installIsPinned("pip", "pip install git+https://x.invalid/r@b81d40e"),
    ).toBe(true)
    expect(
      installIsPinned("git", "pip install git+https://x.invalid/r@b81d40e"),
    ).toBe(true)
    expect(installIsPinned("git", "pip install git+https://x.invalid/r")).toBe(
      false,
    )
    expect(installIsPinned("container", "docker pull ghcr.io/x/y:1.2")).toBe(
      true,
    )
    expect(installIsPinned("container", "docker pull ghcr.io/x/y")).toBe(false)
    expect(installIsPinned("source", "anything")).toBe(false)
  })
})

describe("pinPipCommand", () => {
  it("pins and re-pins the synthesized pip form", () => {
    expect(pinPipCommand("pip install liger-kernel", "0.5.10")).toBe(
      'pip install "liger-kernel==0.5.10"',
    )
    expect(pinPipCommand('pip install "liger-kernel==0.8.1"', "0.5.10")).toBe(
      'pip install "liger-kernel==0.5.10"',
    )
  })
  it("leaves commands outside the synthesized shape untouched", () => {
    expect(pinPipCommand("uv pip install thing", "1.0")).toBe(
      "uv pip install thing",
    )
    // A source-declared command with flags must never lose them to a pin.
    expect(
      pinPipCommand("pip install thing --extra-index-url https://x", "1.0"),
    ).toBe("pip install thing --extra-index-url https://x")
  })
})
