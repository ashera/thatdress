import { getCurrentTestRegion } from "@/lib/regions";
import { exitSandbox } from "@/lib/actions/regions";

/**
 * Sticky banner shown on every page while the viewer is inside a sandbox /
 * test region, so a prospective partner always knows they're in the
 * private trial space — and can leave it in one click. Renders nothing
 * for everyone else.
 */
export async function SandboxBanner() {
  const region = await getCurrentTestRegion();
  if (!region) return null;

  return (
    <div
      style={{
        background: "#1c1816",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "8px 16px",
        fontSize: 13,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 600 }}>
        Sandbox mode — you&rsquo;re in your private test region.
      </span>
      <span style={{ color: "#cbb7a6" }}>
        Nothing here is visible to the public.
      </span>
      <form action={exitSandbox}>
        <button
          type="submit"
          style={{
            background: "var(--volt-500)",
            color: "#1c1816",
            border: 0,
            borderRadius: 999,
            padding: "4px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Exit sandbox
        </button>
      </form>
    </div>
  );
}
