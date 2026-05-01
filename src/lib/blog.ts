import "server-only";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Render trusted markdown into safe HTML. */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md ?? "", { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
}

/** Best-effort plain-text excerpt for OpenGraph descriptions etc. */
export function stripMarkdown(md: string, max = 160): string {
  if (!md) return "";
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1).trimEnd() + "…";
}

const SLUG_MAX = 80;

/**
 * Slugify a title. Lowercase, ASCII-only, dashes for spaces/punctuation,
 * trimmed to SLUG_MAX. Returns "" if nothing usable remains.
 */
export function slugify(title: string): string {
  return (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}
