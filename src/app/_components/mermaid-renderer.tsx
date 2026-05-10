"use client";

import { useEffect, useRef } from "react";

/**
 * Render any <pre><code class="language-mermaid"> blocks inside the
 * given HTML as actual Mermaid diagrams. Pass the server-rendered
 * markdown HTML in via `html`; the component parses it on mount and
 * swaps each mermaid code block for an inline SVG.
 *
 * Mermaid is dynamically imported so it only ships when this
 * component renders (~1MB) — keeps it out of the main bundle.
 */
export function MermaidRenderer({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!ref.current) return;

    const blocks = Array.from(
      ref.current.querySelectorAll<HTMLElement>("code.language-mermaid"),
    );
    if (blocks.length === 0) return;

    (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        flowchart: { curve: "basis" },
      });

      // Render each block sequentially. mermaid.render returns SVG
      // text and a function to register interactive bindings; we
      // only need the SVG.
      for (let i = 0; i < blocks.length; i++) {
        if (cancelled) return;
        const code = blocks[i];
        const source = code.textContent ?? "";
        const id = `mermaid-${Date.now()}-${i}`;
        try {
          const { svg } = await mermaid.render(id, source);
          // Replace the surrounding <pre> with the rendered SVG so
          // we don't end up with the source code visible alongside.
          const pre = code.closest("pre");
          if (pre && pre.parentElement) {
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-diagram";
            wrapper.innerHTML = svg;
            pre.parentElement.replaceChild(wrapper, pre);
          } else {
            code.innerHTML = svg;
          }
        } catch (e) {
          // Log to console only — keep the page clean of error UI.
          // eslint-disable-next-line no-console
          console.error("[mermaid] render failed", id, e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <article
      ref={ref}
      className="prose"
      style={{
        background: "var(--surface)",
        padding: "var(--s-6) var(--s-7)",
        borderRadius: 14,
        border: "1px solid var(--hairline)",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
