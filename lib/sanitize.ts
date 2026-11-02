/**
 * 轻量 HTML 消毒：题库内容为本地/自托管结构化标注，此处防御性清理脚本与事件处理器，
 * 防止 XSS。渲染用 dangerouslySetInnerHTML 时一律先过此函数。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return String(html)
    .replace(/<\s*(script|iframe|object|embed|link|meta|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[\s\S]*?on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi, "$1='#'")
    // 题库 HTML 内嵌图片路径 /90-图片/… → /api/images/…（非 ASCII 路由在 Windows/Next 上不稳定，
    // 图片统一走 ASCII 路由）
    .replace(/\/90-图片\//g, "/api/images/")
    // 给公式图 / 题目图打 class，便于暗色模式单独处理（仅加标记，不改动原图）
    .replace(/<img(\s+[^>]*?src="[^"]*公式图[^"]*"[^>]*)>/g, '<img class="formula-img"$1>')
    .replace(/<img(\s+[^>]*?src="[^"]*题目图[^"]*"[^>]*)>/g, '<img class="problem-img"$1>');
}
