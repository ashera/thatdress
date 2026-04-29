import { buildInfo } from "@/lib/build-info";

export function Footer() {
  return (
    <footer className="footer">
      <div className="row">
        <span>ebikeflip · peer-to-peer eBike marketplace</span>
        <span className="meta">
          <span>v{buildInfo.version}</span>
          <span aria-hidden>·</span>
          <span title={buildInfo.commitFull}>{buildInfo.commit}</span>
        </span>
      </div>
    </footer>
  );
}
