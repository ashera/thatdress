import { buildInfo } from "@/lib/build-info";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white/70 px-6 py-3 text-xs text-zinc-500 backdrop-blur dark:border-zinc-800 dark:bg-black/40 dark:text-zinc-400">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <span>ebikeflip</span>
        <span className="flex items-center gap-2 font-mono">
          <span>v{buildInfo.version}</span>
          <span aria-hidden>·</span>
          <span title={buildInfo.commitFull}>{buildInfo.commit}</span>
        </span>
      </div>
    </footer>
  );
}
