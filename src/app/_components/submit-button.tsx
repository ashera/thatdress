"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost" | "quiet";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pendingLabel?: ReactNode;
  children: ReactNode;
};

export function SubmitButton({
  variant = "dark",
  pendingLabel,
  children,
  className,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  const cls = ["btn", `--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending || undefined}
      className={cls}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        animation: "submit-spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

/**
 * Pending-aware submit button that keeps your own className/style. Use this
 * for inline-styled buttons; use SubmitButton for the standard .btn look.
 */
type PendingProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingChildren?: ReactNode;
  children: ReactNode;
};

export function PendingButton({
  pendingChildren,
  children,
  ...rest
}: PendingProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending || undefined}
    >
      {pending ? pendingChildren ?? children : children}
    </button>
  );
}
