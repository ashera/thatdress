import Link from "next/link";
import { Badge, ButtonLink } from "./ui";

export type ListingCardData = {
  id: string;
  title: string;
  price: string;
  loc?: string;
  condition?: string;
  badge?: string;
  sellerInitials?: string;
  sellerName?: string | null;
  description?: string | null;
  photo?: string;
};

function initials(email?: string | null): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function listingFromRow(row: {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  seller_email: string | null;
  primary_image_id?: string | null;
}): ListingCardData {
  const priceFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const sellerName = row.seller_email
    ? row.seller_email.split("@")[0] ?? row.seller_email
    : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: priceFmt.format(row.price_cents / 100),
    sellerInitials: initials(row.seller_email),
    sellerName,
    photo: row.primary_image_id
      ? `/api/listings/${row.id}/images/${row.primary_image_id}`
      : undefined,
  };
}

export function ListingCard({ data }: { data: ListingCardData }) {
  const detailHref = `/listings/${data.id}`;
  return (
    <article className="listing">
      <div className="img-wrap">
        {data.photo ? (
          <div
            className="photo"
            style={{ backgroundImage: `url(${data.photo})` }}
          />
        ) : (
          <div className="img">eBike photo</div>
        )}
        {(data.badge || data.condition) && (
          <div className="img-flag">
            {data.badge && <Badge variant="volt">{data.badge}</Badge>}
            {data.condition && <Badge variant="ink">{data.condition}</Badge>}
          </div>
        )}
      </div>
      <div className="body">
        <div className="meta-row">
          <div className="seller">
            {data.sellerInitials && (
              <span className="avatar">{data.sellerInitials}</span>
            )}
            {data.sellerName && <span>{data.sellerName}</span>}
          </div>
          {data.loc && <span className="loc">{data.loc}</span>}
        </div>
        <Link href={detailHref} className="title-link">
          <h3 className="title">{data.title}</h3>
        </Link>
        {data.description && <p className="desc">{data.description}</p>}
        <div className="price-row">
          <div className="price">{data.price}</div>
          <ButtonLink
            href={detailHref}
            variant="dark"
            size="sm"
            iconRight="arrow"
          >
            View details
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
