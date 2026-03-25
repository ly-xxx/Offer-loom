import fs from 'node:fs/promises'
import path from 'node:path'

export type Section = {
  anchor: string
  content: string
  endLine: number
  heading: string
  level: number
  startLine: number
}

export function slugify(input: string): string {
  return (input.toLowerCase()
    .replace(/[`~!@#$%^&*()+=|{}':;',/\\[\].<>?！￥…（）【】‘；：”“。，、？]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'section')
}

export function splitIntoSections(documentTitle: string, content: string): Section[] {
  const lines = content.split(/\r?\n/)
  const sections: Section[] = []
  let current:
    | {
        anchor: string
        heading: string
        level: number
        lines: string[]
        startLine: number
      }
    | null = null

  const pushCurrent = (endLine: number) => {
    if (!current) {
      return
    }
    const body = current.lines.join('\n').trim()
    if (!body) {
      return
    }
    sections.push({
      heading: current.heading,
      anchor: current.anchor,
      level: current.level,
      startLine: current.startLine,
      endLine,
      content: body
    })
  }

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (headingMatch) {
      pushCurrent(index)
      current = {
        heading: headingMatch[2].trim(),
        anchor: slugify(headingMatch[2].trim()),
        level: headingMatch[1].length,
        startLine: index + 1,
        lines: []
      }
      return
    }

    if (!current) {
      current = {
        heading: documentTitle,
        anchor: slugify(documentTitle),
        level: 1,
        startLine: 1,
        lines: []
      }
    }
    current.lines.push(line)
  })

  pushCurrent(lines.length)

  return sections.length > 0
    ? sections
    : [{
        heading: documentTitle,
        anchor: slugify(documentTitle),
        level: 1,
        startLine: 1,
        endLine: lines.length,
        content: content.trim()
      }]
}

export async function readLiveContent(filePath: string, fallback: string): Promise<string> {
  try {
    const ext = path.extname(filePath).toLowerCase()
    if (['.pdf', '.ipynb'].includes(ext)) {
      return fallback
    }
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return fallback
  }
}

export function trimExcerpt(content: string, maxLength = 2000): string {
  return content.length > maxLength ? `${content.slice(0, maxLength)}\n...[truncated]` : content
}
