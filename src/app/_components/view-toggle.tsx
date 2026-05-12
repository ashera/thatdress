import Link from "next/link";

export type ListingsView = "cards" | "grid" | "map";

type Props = {
  current: ListingsView;
  hrefFor: (view: ListingsView) => string;
};

const VIEWS: { value: ListingsView; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "grid", label: "Grid" },
  { value: "map", label: "Map" },
];

export function ViewToggle({ current, hrefFor }: Props) {
  return (
    <div className="view-toggle" role="group" aria-label="View">
      {VIEWS.map((v) => (
        <Link
          key={v.value}
          href={hrefFor(v.value)}
          className={`view-toggle-btn ${current === v.value ? "is-active" : ""}`}
          aria-current={current === v.value ? "page" : undefined}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
