import { Node, mergeAttributes } from '@tiptap/core'

export interface MathFormulaOptions {
  HTMLAttributes: Record<string, string | number | boolean>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathFormula: {
      /**
       * Insert a math formula
       */
      insertMathFormula: (formula: string) => ReturnType
    }
  }
}

export const MathFormula = Node.create<MathFormulaOptions>({
  name: 'mathFormula',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      formula: {
        default: '',
        parseHTML: element => element.dataset.formula,
        renderHTML: attributes => {
          return {
            'data-formula': attributes.formula,
            'data-contenteditable': 'false',
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-formula]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const formula = node.attrs.formula as string

    return [
      'span',
      mergeAttributes(
        { class: 'math-formula' },
        HTMLAttributes,
      ),
      formula,
    ]
  },

  addCommands() {
    return {
      insertMathFormula: (formula: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { formula },
        })
      },
    }
  },
})
