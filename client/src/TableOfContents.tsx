import { useMemo } from 'react'
import './TableOfContents.css'

interface HeadingItem {
  level: number
  text: string
  id: string
}

interface TableOfContentsProps {
  editorContent: string
  onItemClick?: (id: string) => void
}

export default function TableOfContents({ editorContent, onItemClick }: TableOfContentsProps) {
  const headings = useMemo(() => {
    if (!editorContent) {
      return []
    }

    // Parse HTML content to extract headings
    const parser = new DOMParser()
    const doc = parser.parseFromString(editorContent, 'text/html')
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    const extractedHeadings: HeadingItem[] = []
    headingElements.forEach((heading, index) => {
      const level = parseInt(heading.tagName[1]) // h1 -> 1, h2 -> 2, etc.
      const text = heading.textContent || ''
      const id = `heading-${index}`

      extractedHeadings.push({
        level,
        text,
        id,
      })
    })

    return extractedHeadings
  }, [editorContent])

  if (headings.length === 0) {
    return (
      <div className="table-of-contents empty">
        <div className="toc-title">Table of Contents</div>
        <div className="toc-empty">No headings found</div>
      </div>
    )
  }

  return (
    <div className="table-of-contents">
      <div className="toc-title">Table of Contents</div>
      <ul className="toc-list">
        {headings.map((heading) => (
          <li
            key={heading.id}
            className={`toc-item level-${heading.level}`}
            onClick={() => onItemClick?.(heading.id)}
          >
            <span className="toc-text">{heading.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
