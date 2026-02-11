import { Node, mergeAttributes } from '@tiptap/core'

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="page-break"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page-break', class: 'page-break' }), '']
  },

  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'page-break'
      dom.setAttribute('data-type', 'page-break')
      dom.contentEditable = 'false'

      const line = document.createElement('div')
      line.className = 'page-break-line'
      dom.appendChild(line)

      const label = document.createElement('span')
      label.className = 'page-break-label'
      label.textContent = 'Page Break'
      dom.appendChild(label)

      return {
        dom,
        ignoreMutation: () => true,
      }
    }
  },
})
