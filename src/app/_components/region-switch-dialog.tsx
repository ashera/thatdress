"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui";

/** False during SSR, true once hydrated — lets us portal the dialog to
 *  <body> only on the client without a setState-in-effect mount flag. */
const subscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * Region control for the listing wizard. Shows the listing's currently
 * assigned region read-only, plus a "Change" button that opens the
 * shared region selector (passed in as `children`, rendered server-side)
 * inside a dialog. Picking a region submits a server action that stamps
 * the listing's region and switches the seller's active region, then
 * redirects back to the wizard — so the dialog closes via navigation and
 * the user never leaves the publish step.
 *
 * The dialog is portalled to <body> on purpose: the publish step wraps
 * everything in its own <form>, and a <form> nested inside another form
 * is dropped by the HTML parser — which is why the picker's submit
 * buttons did nothing. Portalling moves the picker's forms out of the
 * publish form so each region option submits to its own action.
 */
export function RegionSwitchDialog({
  currentLabel,
  children,
}: {
  currentLabel: string | null;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onClose() {
      setOpen(false);
    }
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [open]);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function closeDialog() {
    dialogRef.current?.close();
  }

  const dialog = (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) closeDialog();
      }}
      style={{
        padding: 0,
        border: 0,
        background: "transparent",
        maxWidth: 520,
        width: "calc(100% - 32px)",
        overflow: "visible",
      }}
    >
      {children}
    </dialog>
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div
          aria-readonly="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            color: "var(--ink-1)",
            fontWeight: 600,
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          <Icon name="location" size="sm" />
          <span>{currentLabel ?? "Your region"}</span>
        </div>
        <button
          type="button"
          onClick={openDialog}
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            background: "transparent",
            color: "var(--ink-1)",
            border: "1px solid var(--hairline-strong)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          Change region
        </button>
      </div>

      {hydrated && createPortal(dialog, document.body)}
    </>
  );
}
