"use client"

import React from "react"

// Renders inline markdown: **bold**, *italic* / _italic_, `code`
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Split on **bold**, *italic*, _italic_, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g
  const parts = text.split(regex)
  parts.forEach((part, i) => {
    if (!part) return
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>)
    } else if (/^\*[^*]+\*$/.test(part)) {
      nodes.push(<em key={`${keyPrefix}-i-${i}`}>{part.slice(1, -1)}</em>)
    } else if (/^_[^_]+_$/.test(part)) {
      nodes.push(<em key={`${keyPrefix}-i2-${i}`}>{part.slice(1, -1)}</em>)
    } else if (/^`[^`]+`$/.test(part)) {
      nodes.push(
        <code key={`${keyPrefix}-c-${i}`} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[0.85em] font-mono">
          {part.slice(1, -1)}
        </code>
      )
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>)
    }
  })
  return nodes
}

/**
 * Lightweight markdown renderer for chat messages.
 * Supports: # / ## / ### headings, - • * bullet lists, 1. numbered lists,
 * **bold**, *italic*, _italic_, `code`, and blank-line spacing.
 */
export function FormattedMessage({ content, className = "" }: { content: string; className?: string }) {
  const clean = content.replace(/\[HANDOVER\]/g, "").trim()
  const lines = clean.split("\n")

  const blocks: React.ReactNode[] = []
  let listBuffer: { ordered: boolean; items: string[] } | null = null

  const flushList = (key: string) => {
    if (!listBuffer) return
    const items = listBuffer.items
    if (listBuffer.ordered) {
      blocks.push(
        <ol key={key} className="list-decimal pl-5 space-y-0.5 my-1">
          {items.map((it, i) => <li key={i}>{renderInline(it, `${key}-${i}`)}</li>)}
        </ol>
      )
    } else {
      blocks.push(
        <ul key={key} className="space-y-0.5 my-1">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="opacity-50 select-none">•</span>
              <span className="flex-1">{renderInline(it, `${key}-${i}`)}</span>
            </li>
          ))}
        </ul>
      )
    }
    listBuffer = null
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd()
    const key = `blk-${idx}`

    // Blank line → close list, add small gap
    if (line.trim() === "") {
      flushList(`${key}-fl`)
      blocks.push(<div key={key} className="h-1.5" />)
      return
    }

    // Headings
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushList(`${key}-fl`)
      const level = heading[1].length
      const txt = heading[2]
      const cls = level === 1
        ? "text-base font-bold mt-1 mb-0.5"
        : level === 2
          ? "text-sm font-bold mt-1 mb-0.5"
          : "text-sm font-semibold mt-0.5"
      blocks.push(<p key={key} className={cls}>{renderInline(txt, key)}</p>)
      return
    }

    // Bullet list item
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/)
    if (bullet) {
      if (!listBuffer || listBuffer.ordered) { flushList(`${key}-fl`); listBuffer = { ordered: false, items: [] } }
      listBuffer.items.push(bullet[1])
      return
    }

    // Numbered list item
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (numbered) {
      if (!listBuffer || !listBuffer.ordered) { flushList(`${key}-fl`); listBuffer = { ordered: true, items: [] } }
      listBuffer.items.push(numbered[1])
      return
    }

    // Plain paragraph
    flushList(`${key}-fl`)
    blocks.push(<p key={key}>{renderInline(line, key)}</p>)
  })

  flushList("blk-final")

  return <div className={className}>{blocks}</div>
}
