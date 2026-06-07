import "server-only";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";

export const SAMPLE_LISTINGS_DEFAULT = 12;
export const SAMPLE_LISTINGS_MAX = 48;

/**
 * Local-only sample/demo data. Every sample row hangs off a user whose
 * email matches `sample+...@frockd.test`, so cleanup is precise: delete
 * those users' listings + dresses, then the users — the cascade FKs sweep
 * conversations/offers/shortlists/reviews/partner regions. Reference data
 * (regions, designers, …) and real accounts are never touched.
 *
 * Guarded to non-production. Buttons live in /admin/sample-data.
 */

const SAMPLE_EMAIL_LIKE = "sample+%@frockd.test";

export function sampleDataEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function guard() {
  if (!sampleDataEnabled()) {
    throw new Error("Sample data is disabled in production.");
  }
}

// --- tiny dependency-free PNG encoder (solid colour placeholder) --------
let CRC_TABLE: number[] | null = null;
function crcTable(): number[] {
  if (CRC_TABLE) return CRC_TABLE;
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(buf: Buffer): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const row = Buffer.alloc(1 + w * 3); // filter byte 0 + RGB pixels
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const PALETTE: Array<[number, number, number]> = [
  [214, 140, 150], // dusty rose
  [222, 184, 110], // gold
  [150, 170, 200], // slate blue
  [170, 190, 160], // sage
  [200, 160, 190], // mauve
  [180, 150, 130], // taupe
];

// --- listing photos -----------------------------------------------------
export type SampleImage = { mime: string; bytes: Buffer };

function mimeFromExt(file: string): string {
  const e = file.toLowerCase();
  if (e.endsWith(".png")) return "image/png";
  if (e.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Image files the user has dropped in db/sample-images/ (jpg/png/webp),
 *  in stable sorted order. Empty if the folder is missing/empty. */
function localSampleImageNames(): string[] {
  const dir = path.join(process.cwd(), "db", "sample-images");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Resolve one image per listing. Uses your own photos from
 *  db/sample-images/ (cycled) when present; otherwise a generated
 *  colour placeholder. No network access. */
export function resolveSampleImages(count: number): SampleImage[] {
  const dir = path.join(process.cwd(), "db", "sample-images");
  const names = localSampleImageNames();
  if (names.length > 0) {
    const buffers = names.map((f) => fs.readFileSync(path.join(dir, f)));
    return Array.from({ length: count }, (_, i) => ({
      mime: mimeFromExt(names[i % names.length]),
      bytes: buffers[i % buffers.length],
    }));
  }
  return Array.from({ length: count }, (_, i) => ({
    mime: "image/png",
    bytes: solidPng(120, 160, PALETTE[i % PALETTE.length]),
  }));
}

// --- counts (for the admin panel) ---------------------------------------
export type SampleCounts = { users: number; listings: number };
export async function getSampleCounts(): Promise<SampleCounts> {
  try {
    const r = await query<{ users: string; listings: string }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE email LIKE $1)::text AS users,
         (SELECT COUNT(*) FROM listings
            WHERE seller_id IN (SELECT id FROM users WHERE email LIKE $1))::text
           AS listings`,
      [SAMPLE_EMAIL_LIKE],
    );
    return {
      users: Number(r.rows[0]?.users ?? 0),
      listings: Number(r.rows[0]?.listings ?? 0),
    };
  } catch {
    return { users: 0, listings: 0 };
  }
}

// --- cleanup ------------------------------------------------------------
export async function cleanupSampleData(): Promise<{ usersRemoved: number }> {
  guard();
  return withTransaction(async (c) => {
    const idsRes = await c.query<{ id: string }>(
      `SELECT id::text FROM users WHERE email LIKE $1`,
      [SAMPLE_EMAIL_LIKE],
    );
    const ids = idsRes.rows.map((r) => r.id);
    if (ids.length === 0) return { usersRemoved: 0 };

    await c.query(
      `DELETE FROM listing_images
        WHERE listing_id IN (SELECT id FROM listings WHERE seller_id = ANY($1::bigint[]))`,
      [ids],
    );
    await c.query(
      `DELETE FROM dress_ownership_events
        WHERE dress_id IN (
                SELECT id FROM dresses
                 WHERE created_by_user_id = ANY($1::bigint[])
                    OR current_owner_user_id = ANY($1::bigint[]))
           OR to_user_id = ANY($1::bigint[])
           OR from_user_id = ANY($1::bigint[])`,
      [ids],
    );
    await c.query(`DELETE FROM listings WHERE seller_id = ANY($1::bigint[])`, [ids]);
    await c.query(
      `DELETE FROM dresses
        WHERE created_by_user_id = ANY($1::bigint[])
           OR current_owner_user_id = ANY($1::bigint[])`,
      [ids],
    );
    await c.query(`DELETE FROM sessions WHERE user_id = ANY($1::bigint[])`, [ids]);
    await c.query(
      `DELETE FROM sent_emails
        WHERE to_email IN (SELECT email FROM users WHERE id = ANY($1::bigint[]))`,
      [ids],
    );
    // Cascade removes conversations / messages / offers / shortlists /
    // listing_reviews / partner_marketing_regions for these users.
    await c.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
    return { usersRemoved: ids.length };
  });
}

// --- seed ---------------------------------------------------------------
export type SeedCounts = {
  users: number;
  listings: number;
  shortlists: number;
  offers: number;
  conversations: number;
  reviews: number;
  partnerFees: number;
};

export async function seedSampleData(
  opts: { listings?: number } = {},
): Promise<SeedCounts> {
  guard();
  const count = Math.max(
    1,
    Math.min(SAMPLE_LISTINGS_MAX, Math.floor(opts.listings ?? SAMPLE_LISTINGS_DEFAULT)),
  );

  // Always start clean so re-seeding doesn't pile up duplicates.
  await cleanupSampleData();

  const passwordHash = await bcrypt.hash("Sample123", 10);
  // Resolve photos before the transaction (fs I/O).
  const images = resolveSampleImages(count);

  return withTransaction(async (c) => {
    const idList = async (table: string): Promise<string[]> =>
      (await c.query<{ id: string }>(`SELECT id::text FROM ${table} ORDER BY id`)).rows.map(
        (r) => r.id,
      );
    const pick = (arr: string[], i: number): string | null =>
      arr.length ? arr[i % arr.length] : null;

    const designers = (
      await c.query<{ id: string; name: string }>(
        `SELECT id::text, name FROM designers ORDER BY id`,
      )
    ).rows;
    const occasions = await idList("occasions");
    const conditions = await idList("condition_grades");
    const sizes = await idList("dress_sizes");
    const silhouettes = await idList("silhouettes");
    const fabrics = await idList("fabrics");
    const necklines = await idList("necklines");
    const sleeves = await idList("sleeve_styles");
    const lengths = await idList("dress_lengths");

    const mkUser = async (
      local: string,
      first: string,
      surname: string,
      region: "syd" | "mel",
      isPartner = false,
    ): Promise<string> => {
      const town = region === "syd" ? "Sydney" : "Melbourne";
      const postcode = region === "syd" ? "2000" : "3000";
      const r = await c.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, email_verified_at, is_partner,
            first_name, surname, town, postcode)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7)
         RETURNING id::text`,
        [`sample+${local}@frockd.test`, passwordHash, isPartner, first, surname, town, postcode],
      );
      return r.rows[0]!.id;
    };

    const seller1 = await mkUser("seller1", "Sasha", "Stone", "syd");
    const seller2 = await mkUser("seller2", "Mei", "Lin", "mel");
    const seller3 = await mkUser("seller3", "Priya", "Rao", "syd");
    const buyer1 = await mkUser("buyer1", "Bel", "Hart", "mel");
    const buyer2 = await mkUser("buyer2", "Cleo", "Vance", "syd");
    const partner1 = await mkUser("partner1", "Dana", "Cole", "mel", true);
    const sellers = [seller1, seller2, seller3];

    const COLOR_NAMES = ["Blush", "Ivory", "Emerald", "Navy", "Champagne", "Black"];
    const created: Array<{ id: string; seller: string; region: string }> = [];

    for (let i = 0; i < count; i++) {
      const seller = sellers[i % sellers.length];
      const region = i % 2 === 0 ? "7" : "8"; // Sydney / Melbourne (active)
      const postcode = region === "7" ? "2000" : "3000";
      const designer = designers[i % Math.max(1, designers.length)];
      const model = `Sample ${i + 1}`;

      const dRes = await c.query<{ id: string }>(
        `INSERT INTO dresses
           (created_by_user_id, current_owner_user_id, disposition, designer_id,
            model, year, size_id, silhouette_id, fabric_id, neckline_id,
            sleeve_style_id, length_id, color, bust_cm, waist_cm, hips_cm,
            original_retail_cents)
         VALUES ($1::bigint, $1::bigint, 'available', $2::bigint, $3, $4::int,
                 $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id::text`,
        [
          seller,
          designer?.id ?? null,
          model,
          2020 + (i % 5),
          pick(sizes, i),
          pick(silhouettes, i),
          pick(fabrics, i),
          pick(necklines, i),
          pick(sleeves, i),
          pick(lengths, i),
          COLOR_NAMES[i % COLOR_NAMES.length],
          80 + (i % 12),
          62 + (i % 12),
          88 + (i % 12),
          (40000 + i * 5000),
        ],
      );
      const dressId = dRes.rows[0]!.id;
      await c.query(
        `INSERT INTO dress_ownership_events (dress_id, to_user_id, event_type)
           VALUES ($1::bigint, $2::bigint, 'created')`,
        [dressId, seller],
      );

      const title = `${designer?.name ?? "Designer"} ${model}`;
      const lRes = await c.query<{ id: string }>(
        `INSERT INTO listings
           (dress_id, title, description, price_cents, seller_id, is_draft,
            is_published, region_id, offers_enabled, trust_status, occasion_id,
            condition_id, location_postal, is_authentic_declared)
         VALUES ($1::bigint, $2, $3, $4, $5::bigint, FALSE, TRUE, $6::bigint,
                 TRUE, 'self-declared', $7, $8, $9, TRUE)
         RETURNING id::text`,
        [
          dressId,
          title,
          "Sample listing for local testing. Worn once, excellent condition.",
          15000 + i * 4000,
          seller,
          region,
          pick(occasions, i),
          pick(conditions, i),
          postcode,
        ],
      );
      const listingId = lRes.rows[0]!.id;

      const img = images[i];
      await c.query(
        `INSERT INTO listing_images
           (listing_id, mime_type, bytes, byte_size, position, is_primary, role)
         VALUES ($1::bigint, $2, $3, $4, 0, TRUE, 'front')`,
        [listingId, img.mime, img.bytes, img.bytes.length],
      );

      created.push({ id: listingId, seller, region });
    }

    // Shortlists (only on listings that exist for this count).
    let shortlists = 0;
    const shortlistPairs: Array<[string, number]> = [
      [buyer1, 0],
      [buyer1, 2],
      [buyer1, 4],
      [buyer2, 1],
      [buyer2, 3],
    ];
    for (const [uid, idx] of shortlistPairs) {
      if (idx >= created.length) continue;
      await c.query(
        `INSERT INTO shortlists (user_id, listing_id) VALUES ($1::bigint, $2::bigint)
         ON CONFLICT DO NOTHING`,
        [uid, created[idx].id],
      );
      shortlists++;
    }

    // Pick up to three distinct listings for offer / question / sale.
    const eng: number[] = [];
    for (const cand of [5, 6, 7, 2, 1, 0]) {
      if (cand < created.length && !eng.includes(cand)) eng.push(cand);
      if (eng.length === 3) break;
    }
    const [offerIdx, qIdx, soldIdx] = [eng[0] ?? -1, eng[1] ?? -1, eng[2] ?? -1];

    let offers = 0;
    let conversations = 0;
    let reviews = 0;

    // Conversation + offer (buyer1 on a seller's listing).
    if (offerIdx >= 0) {
      const offerListing = created[offerIdx];
      const conv1 = await c.query<{ id: string }>(
        `INSERT INTO conversations (listing_id, buyer_id, seller_id)
           VALUES ($1::bigint, $2::bigint, $3::bigint) RETURNING id::text`,
        [offerListing.id, buyer1, offerListing.seller],
      );
      await c.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
           VALUES ($1::bigint, $2::bigint, $3)`,
        [conv1.rows[0]!.id, buyer1, "Hi! Would you consider $180 for this?"],
      );
      await c.query(
        `INSERT INTO offers (listing_id, buyer_id, amount_cents, note, status)
           VALUES ($1::bigint, $2::bigint, $3, $4, 'pending')`,
        [offerListing.id, buyer1, 18000, "Keen if the price works."],
      );
      offers++;
      conversations++;
    }

    // Standalone conversation (buyer2 asks a question, seller replies).
    if (qIdx >= 0) {
      const qListing = created[qIdx];
      const conv2 = await c.query<{ id: string }>(
        `INSERT INTO conversations (listing_id, buyer_id, seller_id)
           VALUES ($1::bigint, $2::bigint, $3::bigint) RETURNING id::text`,
        [qListing.id, buyer2, qListing.seller],
      );
      await c.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
           VALUES ($1::bigint, $2::bigint, $3), ($1::bigint, $4::bigint, $5)`,
        [
          conv2.rows[0]!.id,
          buyer2,
          "Is the zip in good working order?",
          qListing.seller,
          "Yes, zip and lining are perfect — happy to send more photos.",
        ],
      );
      conversations++;
    }

    // A sold listing with a buyer review (full lifecycle).
    if (soldIdx >= 0) {
      const soldListing = created[soldIdx];
      const soldDress = await c.query<{ dress_id: string }>(
        `UPDATE listings SET sold_at = NOW(), sold_to_user_id = $2::bigint
          WHERE id = $1::bigint RETURNING dress_id::text`,
        [soldListing.id, buyer2],
      );
      const soldDressId = soldDress.rows[0]!.dress_id;
      await c.query(
        `UPDATE dresses
            SET current_owner_user_id = $2::bigint, disposition = 'in-use'
          WHERE id = $1::bigint`,
        [soldDressId, buyer2],
      );
      await c.query(
        `INSERT INTO dress_ownership_events
           (dress_id, from_user_id, to_user_id, via_listing_id, event_type)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, 'sold')`,
        [soldDressId, soldListing.seller, buyer2, soldListing.id],
      );
      await c.query(
        `INSERT INTO listing_reviews
           (listing_id, seller_id, buyer_id, stars, body,
            as_described, easy_communication, smooth_handover)
         VALUES ($1::bigint, $2::bigint, $3::bigint, 5, $4, TRUE, TRUE, TRUE)`,
        [soldListing.id, soldListing.seller, buyer2, "Gorgeous dress, exactly as described. Smooth pickup!"],
      );
      reviews++;
    }

    // Partner with a regional listing fee (region 8, not claimed by the
    // base seed which uses region 7).
    await c.query(
      `INSERT INTO partner_marketing_regions (user_id, region_id, listing_fee_cents)
         VALUES ($1::bigint, 8, 1500)
       ON CONFLICT (region_id) DO UPDATE
         SET user_id = EXCLUDED.user_id, listing_fee_cents = EXCLUDED.listing_fee_cents`,
      [partner1],
    );

    return {
      users: 6,
      listings: created.length,
      shortlists,
      offers,
      conversations,
      reviews,
      partnerFees: 1,
    };
  });
}
