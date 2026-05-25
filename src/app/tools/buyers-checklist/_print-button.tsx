"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 999,
        background: "var(--ink-1)",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 14,
        fontFamily: "inherit",
      }}
    >
      <span aria-hidden style={{ fontSize: 16 }}>🖨️</span>
      Print checklist
    </button>
  );
}
