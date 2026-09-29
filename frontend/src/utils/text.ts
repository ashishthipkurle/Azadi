export function stripHtml(html: string): string {
  if (!html) return '';
  let text = '';
  let i = 0;
  while (i < html.length) {
    let startTag = html.indexOf('<', i);
    if (startTag === -1) {
      text += html.substring(i);
      break;
    }
    text += html.substring(i, startTag);
    let endTag = html.indexOf('>', startTag);
    if (endTag === -1) break;
    i = endTag + 1;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract the src of the first <img> tag in an HTML string.
 * Returns null if no image is found.
 */
export function extractFirstImageSrc(html: string): string | null {
  if (!html) return null;
  // Find <img ... src="..." ...>
  const imgStart = html.indexOf('<img');
  if (imgStart === -1) return null;
  const imgEnd = html.indexOf('>', imgStart);
  if (imgEnd === -1) return null;
  const imgTag = html.substring(imgStart, imgEnd + 1);
  // Try src="..." or src='...'
  const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/);
  return srcMatch ? srcMatch[1] : null;
}
