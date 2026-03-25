export function normalizeMarkdownForRender(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/\$\$([\s\S]*?)\$\$/g, (fullMatch, body: string) => {
      const trimmed = body.trim()
      if (!trimmed) {
        return fullMatch
      }

      // `remark-math` + KaTeX is strict about multiline display math.
      // Putting the body on its own lines prevents `\begin{cases}`-style
      // blocks from degrading into visible raw TeX in the UI.
      if (trimmed.includes('\n')) {
        return `$$\n${trimmed}\n$$`
      }

      return `$$${trimmed}$$`
    })
}
