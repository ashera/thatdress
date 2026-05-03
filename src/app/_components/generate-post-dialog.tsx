"use client";

import { useRef, useState } from "react";

type Props = {
  systemPrompt: string;
  userPrompt: string;
  disabled: boolean;
  disabledReason?: string;
};

export function GeneratePostDialog({
  systemPrompt,
  userPrompt,
  disabled,
  disabledReason,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<"system" | "user" | "both" | null>(null);

  function open() {
    ref.current?.showModal();
  }
  function close() {
    ref.current?.close();
    setCopied(null);
  }
  async function copy(text: string, which: "system" | "user" | "both") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — silent
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        title={disabled ? disabledReason : "Preview the prompt"}
        className="btn --primary"
      >
        Generate Post
      </button>

      <dialog
        ref={ref}
        onClick={(e) => {
          // close on backdrop click
          if (e.target === ref.current) close();
        }}
        style={{
          maxWidth: 880,
          width: "min(880px, 92vw)",
          maxHeight: "85vh",
          padding: 0,
          border: "1px solid var(--hairline)",
          borderRadius: 12,
          background: "#fff",
          color: "var(--ink-1)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: "85vh",
          }}
        >
          <header
            style={{
              padding: "var(--s-4) var(--s-5)",
              borderBottom: "1px solid var(--hairline)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "var(--s-3)",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ink-3)",
                }}
              >
                Prompt preview
              </p>
              <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>
                What would be sent to Claude
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "var(--ink-3)",
                  fontSize: 13,
                }}
              >
                Nothing has been sent yet. This is a dry run so you can review
                the inputs before wiring up the real generation.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              style={{
                background: "transparent",
                border: 0,
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: 4,
              }}
            >
              ×
            </button>
          </header>

          <div
            style={{
              padding: "var(--s-4) var(--s-5)",
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <PromptBlock
              title="System prompt"
              body={systemPrompt}
              onCopy={() => copy(systemPrompt, "system")}
              copied={copied === "system"}
            />
            <PromptBlock
              title="User prompt"
              body={userPrompt}
              onCopy={() => copy(userPrompt, "user")}
              copied={copied === "user"}
            />
          </div>

          <footer
            style={{
              padding: "var(--s-3) var(--s-5)",
              borderTop: "1px solid var(--hairline)",
              display: "flex",
              gap: "var(--s-2)",
              justifyContent: "flex-end",
              background: "var(--surface-sunken)",
            }}
          >
            <button
              type="button"
              onClick={() =>
                copy(
                  `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`,
                  "both",
                )
              }
              className="btn --ghost"
            >
              {copied === "both" ? "Copied!" : "Copy both"}
            </button>
            <button type="button" onClick={close} className="btn --dark">
              Close
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}

function PromptBlock({
  title,
  body,
  onCopy,
  copied,
}: {
  title: string;
  body: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--ink-3)",
          }}
        >
          {title}
        </h4>
        <button
          type="button"
          onClick={onCopy}
          style={{
            background: "transparent",
            border: "1px solid var(--hairline)",
            borderRadius: 999,
            padding: "2px 10px",
            fontSize: 11,
            color: "var(--ink-2)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "var(--s-3)",
          background: "var(--surface-sunken)",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.5,
          color: "var(--ink-2)",
        }}
      >
        {body}
      </pre>
    </div>
  );
}
