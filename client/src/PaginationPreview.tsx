import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './PaginationPreview.css'

interface PaginationPreviewProps {
  editorContent: string
  pageHeight?: number
  pageWidth?: number
}

export default function PaginationPreview({
  editorContent,
  pageHeight = 1120, // A4 height in pixels
  pageWidth = 800 // A4 width in pixels
}: PaginationPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !editorContent) return

    // Clear previous content
    containerRef.current.innerHTML = ''

    // Create a temporary container to render content
    const tempContainer = document.createElement('div')
    tempContainer.innerHTML = editorContent
    containerRef.current.appendChild(tempContainer)

    const pages: HTMLElement[] = []
    let currentPage = document.createElement('div')
    currentPage.className = 'page'
    currentPage.style.height = `${pageHeight}px`
    currentPage.style.width = `${pageWidth}px`

    // Clone content nodes and distribute to pages
    const nodes = Array.from(tempContainer.children)
    let currentPageHeight = 0

    nodes.forEach((node) => {
      const clonedNode = node.cloneNode(true) as HTMLElement

      // Measure node height
      const tempNode = document.createElement('div')
      tempNode.style.position = 'absolute'
      tempNode.style.visibility = 'hidden'
      tempNode.appendChild(clonedNode.cloneNode(true))
      document.body.appendChild(tempNode)
      const nodeHeight = tempNode.offsetHeight
      document.body.removeChild(tempNode)

      // Check if node fits in current page
      if (currentPageHeight + nodeHeight <= pageHeight) {
        currentPage.appendChild(clonedNode)
        currentPageHeight += nodeHeight
      } else {
        // Add current page to pages array
        pages.push(currentPage)

        // Create new page and add node
        currentPage = document.createElement('div')
        currentPage.className = 'page'
        currentPage.style.height = `${pageHeight}px`
        currentPage.style.width = `${pageWidth}px`
        currentPage.appendChild(clonedNode)
        currentPageHeight = nodeHeight
      }
    })

    // Add last page if it has content
    if (currentPage.children.length > 0) {
      pages.push(currentPage)
    }

    // Clear container and add pages
    containerRef.current.innerHTML = ''
    pages.forEach((page, index) => {
      // Add page number
      const pageNumber = document.createElement('div')
      pageNumber.className = 'page-number'
      pageNumber.textContent = `第 ${index + 1} 页`
      page.appendChild(pageNumber)
      containerRef.current?.appendChild(page)
    })

    // Render math formulas in preview
    requestAnimationFrame(() => {
      const mathElements = containerRef.current?.querySelectorAll('span[data-formula]')
      mathElements?.forEach(element => {
        const formula = element.dataset.formula
        if (formula && !element.querySelector('.katex')) {
          try {
            katex.render(formula, element as HTMLElement, {
              throwOnError: false,
              displayMode: false,
            })
          } catch (error) {
            console.error('Error rendering math formula in preview:', error)
          }
        }
      })
    })
  }, [editorContent, pageHeight, pageWidth])

  return (
    <div className="pagination-preview">
      <div ref={containerRef} className="pages-container" />
    </div>
  )
}
