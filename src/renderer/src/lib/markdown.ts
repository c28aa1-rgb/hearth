import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Mod descriptions are written by third parties, so everything is sanitized. Links and
// images that point at Modrinth-relative paths are resolved against modrinth.com, and
// every link opens in the real browser (the main process enforces this too).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement) {
    const href = node.getAttribute('href')
    if (href && !href.startsWith('#')) {
      try {
        node.setAttribute('href', new URL(href, 'https://modrinth.com/').href)
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noreferrer')
      } catch {
        node.removeAttribute('href')
      }
    }
  }
  if (node instanceof HTMLImageElement) {
    const src = node.getAttribute('src')
    try {
      const url = new URL(src ?? '', 'https://modrinth.com/')
      if (url.protocol !== 'https:') throw new Error('insecure')
      node.setAttribute('src', url.href)
      node.setAttribute('loading', 'lazy')
      node.setAttribute('referrerpolicy', 'no-referrer')
    } catch {
      node.remove()
    }
  }
})

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { gfm: true, async: false })
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'video', 'audio'],
    FORBID_ATTR: ['style', 'class', 'id']
  })
}
