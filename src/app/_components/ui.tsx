import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type IconName =
  | "search"
  | "heart"
  | "bolt"
  | "battery"
  | "speed"
  | "range"
  | "location"
  | "shield"
  | "check"
  | "star"
  | "user"
  | "msg"
  | "chev"
  | "plus"
  | "arrow"
  | "verified"
  | "moon";

const ICON_PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  heart: (
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  ),
  bolt: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  battery: (
    <>
      <rect x="2" y="7" width="18" height="10" rx="2" />
      <path d="M22 11v2" />
      <path d="M6 10v4M10 10v4M14 10v4" />
    </>
  ),
  speed: (
    <>
      <path d="M12 14v-4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M5 6 4 4M19 6l1-2" />
    </>
  ),
  range: (
    <>
      <path d="M3 12h18" />
      <path d="m14 5 7 7-7 7" />
    </>
  ),
  location: (
    <>
      <path d="M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  shield: <path d="M12 2 4 5v6c0 5 3.5 9.4 8 11 4.5-1.6 8-6 8-11V5l-8-3z" />,
  check: <path d="m4 12 5 5L20 6" />,
  star: <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </>
  ),
  msg: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  chev: <path d="m6 9 6 6 6-6" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  verified: (
    <>
      <path d="m4.5 9 2-3 3.5.5L12 3l2 3.5 3.5-.5 2 3-1.5 3 1.5 3-2 3-3.5-.5L12 21l-2-3.5-3.5.5-2-3 1.5-3z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  moon: <path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z" />,
};

export function Icon({
  name,
  size,
  className,
}: {
  name: IconName;
  size?: "sm" | "lg";
  className?: string;
}) {
  const cls = ["ico", size && size, className].filter(Boolean).join(" ");
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

type ButtonVariant = "primary" | "dark" | "ghost" | "quiet";
type ButtonSize = "sm" | "lg";

type CommonButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
};

function buttonClass({
  variant = "dark",
  size,
  block,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  return [
    "btn",
    `--${variant}`,
    size && `--${size}`,
    block && "--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  block,
  icon,
  iconRight,
  children,
  className,
  ...rest
}: CommonButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...rest}
      className={buttonClass({ variant, size, block, className })}
    >
      {icon && <Icon name={icon} size="sm" />}
      {children}
      {iconRight && <Icon name={iconRight} size="sm" />}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  iconRight,
  children,
  className,
  href,
  ...rest
}: CommonButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    className?: string;
  }) {
  const internal = href.startsWith("/") && !href.startsWith("//");
  const cls = buttonClass({ variant, size, block, className });

  if (internal) {
    return (
      <Link href={href} className={cls}>
        {icon && <Icon name={icon} size="sm" />}
        {children}
        {iconRight && <Icon name={iconRight} size="sm" />}
      </Link>
    );
  }

  return (
    <a {...rest} href={href} className={cls}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
      {iconRight && <Icon name={iconRight} size="sm" />}
    </a>
  );
}

type BadgeVariant =
  | "default"
  | "volt"
  | "volt-soft"
  | "ok"
  | "warn"
  | "info"
  | "ink";

export function Badge({
  variant = "default",
  size,
  icon,
  children,
}: {
  variant?: BadgeVariant;
  size?: "lg";
  icon?: IconName;
  children: ReactNode;
}) {
  const cls = [
    "badge",
    variant !== "default" && `--${variant}`,
    size && `--${size}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}

export function Spec({
  k,
  v,
  unit,
}: {
  k: string;
  v: ReactNode;
  unit?: string;
}) {
  return (
    <div className="spec">
      <div className="v">
        {v}
        {unit && <small>{unit}</small>}
      </div>
      <div className="k">{k}</div>
    </div>
  );
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={["input", className].filter(Boolean).join(" ")} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={["input", className].filter(Boolean).join(" ")}
    />
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      {children}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}
