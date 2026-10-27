const allowedAnnouncementTags = new Set(["B", "STRONG", "I", "EM", "BR", "P", "DIV"]);
const richAnnouncementMarker = "<!--incoc-announcement-richtext-v1-->";

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeSafeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes, serializeSafeNode).join("");
  if (!allowedAnnouncementTags.has(node.tagName)) return children;
  if (tag === "br") return "<br>";
  return `<${tag}>${children}</${tag}>`;
}

export function sanitizeAnnouncementBody(value: string) {
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const safeHtml = Array.from(parsed.body.childNodes, serializeSafeNode).join("");
  if (/<\/?(?:b|strong|i|em)\b/i.test(safeHtml)) return `${richAnnouncementMarker}${safeHtml}`;

  const textDocument = new DOMParser().parseFromString(safeHtml, "text/html");
  function toPlainText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    if (node.tagName === "BR") return "\n";
    const text = Array.from(node.childNodes, toPlainText).join("");
    return ["DIV", "P"].includes(node.tagName) && text ? `${text}\n` : text;
  }
  return Array.from(textDocument.body.childNodes, toPlainText).join("").replace(/\n+$/, "");
}

export function announcementBodyEditorHtml(value: string) {
  if (value.startsWith(richAnnouncementMarker)) {
    return sanitizeAnnouncementBody(value.slice(richAnnouncementMarker.length)).slice(richAnnouncementMarker.length);
  }
  return escapeText(value).replace(/\r\n?|\n/g, "<br>");
}

export function isRichAnnouncementBody(value: string) {
  return value.startsWith(richAnnouncementMarker);
}

export function richAnnouncementBodyHtml(value: string) {
  return isRichAnnouncementBody(value)
    ? sanitizeAnnouncementBody(value.slice(richAnnouncementMarker.length)).slice(richAnnouncementMarker.length)
    : null;
}

export function announcementBodyPreview(value: string) {
  const html = richAnnouncementBodyHtml(value);
  if (html === null) return value;
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}
