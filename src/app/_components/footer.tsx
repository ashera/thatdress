import { buildInfo } from "@/lib/build-info";

export function Footer() {
  return (
    <footer className="border-t border-sand-200/80 bg-sand-50/80 px-6 py-3 text-xs text-sand-700 backdrop-blur dark:border-ocean-800/70 dark:bg-ocean-950/70 dark:text-sand-300">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span aria-hidden>🚲</span>
          <span>ebikeflip · seaside marketplace</span>
        </span>
        <span className="flex items-center gap-2 font-mono">
          <span>v{buildInfo.version}</span>
          <span aria-hidden>·</span>
          <span title={buildInfo.commitFull}>{buildInfo.commit}</span>
        </span>
      </div>
    </footer>
  );
}
