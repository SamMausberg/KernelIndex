/** Space Grotesk 500 as TTF for the Open Graph cards: the css2 API serves
 * truetype URLs when the request carries no browser user agent. Null when
 * the fetch fails; the card then renders in the default face. */
export async function identityFace(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500",
    ).then((response) => response.text())
    const url = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1]
    if (!url) return null
    return await fetch(url).then((response) => response.arrayBuffer())
  } catch {
    return null
  }
}
