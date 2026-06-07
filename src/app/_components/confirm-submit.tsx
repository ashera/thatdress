"use client";

/**
 * A submit button that asks for confirmation before letting its form
 * submit. Reuses the global `btn` button classes so it matches the design
 * system. For destructive actions inside server-action forms where a
 * stray click would be costly (e.g. deleting a record).
 */
export function ConfirmSubmit({
  message,
  className = "btn --quiet --sm",
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
