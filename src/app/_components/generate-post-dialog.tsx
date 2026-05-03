"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  systemPrompt: string;
  userPrompt: string;
  disabled: boolean;
  disabledReason?: string;
  clusterId: string;
  generateAction: (formData: FormData) => Promise<void>;
};

export function GeneratePostDialog({
  systemPrompt,
  userPrompt,
  disabled,
  disabledReason,
  clusterId,
  generateAction,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"preview" | "confirm">("preview");
  const [copied, setCopied] = useState<"system" | "user" | "both" | null>(null);

  function open() {
    setStage("preview");
    setCopied(null);
    ref.current?.showModal();
  }
  function close() {
    ref.current?.close();
    setCopied(null);
    setStage("preview");
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
          // close on backdrop click — but only when not pending. The confirm
          // form's pending state lives inside the form, so we rely on the
          // submit button being disabled. Closing the dialog mid-submit is
          // harmless because the server action redirects on completion.
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
        {stage === "preview" ? (
          <PreviewView
            systemPrompt={systemPrompt}
            userPrompt={userPrompt}
            copied={copied}
            onCopy={copy}
            onClose={close}
            onContinue={() => setStage("confirm")}
          />
        ) : (
          <ConfirmForm
            clusterId={clusterId}
            generateAction={generateAction}
            onBack={() => setStage("preview")}
            onClose={close}
          />
        )}
      </dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stage 1 — preview the prompt before any send
// ---------------------------------------------------------------------------

function PreviewView({
  systemPrompt,
  userPrompt,
  copied,
  onCopy,
  onClose,
  onContinue,
}: {
  systemPrompt: string;
  userPrompt: string;
  copied: "system" | "user" | "both" | null;
  onCopy: (text: string, which: "system" | "user" | "both") => void;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
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
            Step 1 of 2 · Prompt preview
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>
            Review what will be sent to Claude
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            Skim the prompt before kicking off the generation. The
            generation itself takes ~30–60 seconds and costs a few cents.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
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
          onCopy={() => onCopy(systemPrompt, "system")}
          copied={copied === "system"}
        />
        <PromptBlock
          title="User prompt"
          body={userPrompt}
          onCopy={() => onCopy(userPrompt, "user")}
          copied={copied === "user"}
        />
      </div>

      <footer
        style={{
          padding: "var(--s-3) var(--s-5)",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          gap: "var(--s-2)",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-sunken)",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() =>
            onCopy(`SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`, "both")
          }
          className="btn --ghost"
        >
          {copied === "both" ? "Copied!" : "Copy both"}
        </button>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <button type="button" onClick={onClose} className="btn --ghost">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="btn --primary">
            Looks good — continue →
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — explicit confirm + form submission to the server action
// ---------------------------------------------------------------------------

function ConfirmForm({
  clusterId,
  generateAction,
  onBack,
  onClose,
}: {
  clusterId: string;
  generateAction: (formData: FormData) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <form
      action={generateAction}
      style={{
        display: "flex",
        flexDirection: "column",
        maxHeight: "85vh",
      }}
    >
      <input type="hidden" name="clusterId" value={clusterId} />
      <ConfirmContent onBack={onBack} onClose={onClose} />
    </form>
  );
}

function ConfirmContent({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const { pending } = useFormStatus();

  if (pending) {
    return (
      <div
        style={{
          padding: "var(--s-7) var(--s-5)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--s-3)",
          textAlign: "center",
        }}
      >
        <Spinner size={36} />
        <h3 style={{ margin: 0, fontSize: 18 }}>Generating draft post…</h3>
        <p
          style={{
            margin: 0,
            color: "var(--ink-3)",
            fontSize: 14,
            maxWidth: 480,
          }}
        >
          Calling Claude with the cluster, SERP analysis, hero images, and
          all five reference files. Typical run is 30–60 seconds. You&rsquo;ll
          land on the draft edit page when it&rsquo;s ready.
        </p>
        <p
          style={{
            margin: 0,
            color: "var(--ink-3)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          Don&rsquo;t close this tab.
        </p>
      </div>
    );
  }

  return (
    <>
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
            Step 2 of 2 · Confirm
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>
            Send the prompt to Claude?
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
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

      <div style={{ padding: "var(--s-5)" }}>
        <p style={{ margin: "0 0 var(--s-3)", color: "var(--ink-1)" }}>
          This will:
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            color: "var(--ink-2)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <li>Send the prompt above to the Claude API (~30–60 seconds).</li>
          <li>
            Cost roughly 5–10¢ in Anthropic API credits.
          </li>
          <li>
            Create a new <strong>draft</strong> blog post (not published) and
            link it to this cluster.
          </li>
          <li>Drop you on the draft&rsquo;s edit page to review and publish.</li>
        </ul>
        <p
          style={{
            marginTop: "var(--s-4)",
            marginBottom: 0,
            color: "var(--ink-3)",
            fontSize: 13,
          }}
        >
          Want to try a different draft later? Delete the post on its edit
          page and the Generate button on this cluster unlocks again.
        </p>
      </div>

      <footer
        style={{
          padding: "var(--s-3) var(--s-5)",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          gap: "var(--s-2)",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-sunken)",
        }}
      >
        <button type="button" onClick={onBack} className="btn --ghost">
          ← Back to prompt
        </button>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <button type="button" onClick={onClose} className="btn --ghost">
            Cancel
          </button>
          <button type="submit" className="btn --primary">
            Yes, generate it
          </button>
        </div>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

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

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(2, size / 12)}px solid var(--ink-3)`,
        borderTopColor: "transparent",
        animation: "submit-spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}
