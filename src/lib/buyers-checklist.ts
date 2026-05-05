/**
 * Buyer's-due-diligence checklist for pre-loved formal-dress purchases.
 *
 * Three sections matched to the buyer's actual workflow: triage the
 * listing, vet the seller, then physically inspect at handover. Items
 * draw from references/opinions.md — keep that file authoritative when
 * the editorial line shifts and update here second.
 */

export type ChecklistItem = {
  id: string;
  label: string;
  /** Short one-liner explaining why the item matters. Surfaces under
   *  the checkbox so the user understands the "so what?". */
  why: string;
};

export type ChecklistSection = {
  title: string;
  blurb: string;
  items: ChecklistItem[];
};

export const BUYERS_CHECKLIST: ChecklistSection[] = [
  {
    title: "Before you message the seller",
    blurb:
      "What to look for in the listing itself. If any of these are missing, the seller has a story they aren't telling.",
    items: [
      {
        id: "front-back-lining-photos",
        label:
          "Listing has front, back, AND a wrong-side / lining photo",
        why: "The right side has been styled for the camera. The lining tells the truth — let-out seams, stains, deodorant marks all show up there first.",
      },
      {
        id: "label-photo",
        label: "Designer label is photographed clearly",
        why: "Lets you cross-check fonts, fabric content tags, and label position against the brand's authentic style. Counterfeits get this wrong.",
      },
      {
        id: "receipt",
        label: "Original receipt or proof of purchase is offered",
        why: "Authenticates the designer, locks the price ceiling, and gives you something to fall back on if the brand is questioned later.",
      },
      {
        id: "rrp",
        label: "Original retail price (RRP) is stated",
        why: "Anchors the resale fairness. A 'designer dress at 30% off retail' means very different things at $1,200 vs $4,200 RRP.",
      },
      {
        id: "specific-condition",
        label:
          "Condition is described specifically, not just 'good'",
        why: "'Small lipstick mark inside the bodice, 4cm pull on the left side seam' beats 'good condition' every time. Vague is dealer-speak.",
      },
      {
        id: "measurements",
        label:
          "Bust / waist / hip measurements are listed in cm or inches",
        why: "Designer label numbers lie — Self-Portrait pre-2018 runs a full size small. Always trust the actual centimetres, not the tag.",
      },
    ],
  },
  {
    title: "Questions to ask the seller",
    blurb:
      "Before you transfer money. A real owner has answers; a flipper or scammer doesn't.",
    items: [
      {
        id: "wear-count",
        label: "How many times has it been worn?",
        why: "'Worn once' is the most-told lie on resale platforms. Underarm seams and lining wear give the truth away — ask for close-ups.",
      },
      {
        id: "cleaning-history",
        label: "Has it been dry-cleaned, and how recently?",
        why: "Aggressive dry-cleaning shrinks chiffon and weakens beading threads. The wrong cleaner can quietly ruin a dress.",
      },
      {
        id: "alterations",
        label:
          "Has it ever been altered? Hem, bust, any seams?",
        why: "Alterations narrow the buyer pool and limit what you can do later — once seam allowance is cut, it's gone for good.",
      },
      {
        id: "underarm-photo",
        label:
          "Underarm seam close-ups (if not already in the listing)",
        why: "The first place sweat-marks and stretched seams show up. A genuinely once-worn dress has clean, taut underarm seams.",
      },
      {
        id: "lining-photo",
        label:
          "Lining / inside-out close-up (if not already in the listing)",
        why: "Hides the truth about how often the dress has actually been worn. If the seller refuses, walk.",
      },
      {
        id: "zipper-test",
        label: "Does the zipper run smoothly all the way up?",
        why: "A tetchy zipper is a $60–120 repair, and on a beaded bodice it's much worse. Worth knowing before you buy.",
      },
      {
        id: "tryon",
        label: "Can you try it on before paying (for local pickup)?",
        why: "Sellers who refuse a 15-minute fitting on a $400+ formal dress usually have a fit problem they don't want you to find.",
      },
    ],
  },
  {
    title: "At handover or unboxing",
    blurb:
      "Physical check. Bring this list — it's the difference between $480 well spent and a $480 garment-bag mystery.",
    items: [
      {
        id: "label-matches",
        label:
          "Designer label matches the listing — font, position, fabric content",
        why: "Counterfeits often get the font slightly wrong. Compare against a known authentic on the brand's site.",
      },
      {
        id: "no-stains",
        label: "No surprise stains on the lining or hem",
        why: "Especially the underarm panels and inside the bodice. Foundation and deodorant transfer is hard to remove.",
      },
      {
        id: "no-odours",
        label: "No mystery odours — smoke, perfume, mustiness",
        why: "Smoke and mustiness are very hard to remove from formal-dress fabrics. If you can smell it now, you'll smell it on the night.",
      },
      {
        id: "beadwork",
        label:
          "Beadwork is intact — no missing sections, no loose threads",
        why: "Bead repair runs $40–120 per area, and re-sequinning a panel is often quoted as 'we don't do those'.",
      },
      {
        id: "zipper-goes-up",
        label:
          "Zipper actually goes all the way up smoothly, in person",
        why: "Different from the seller's word. Test it yourself before paying.",
      },
      {
        id: "hidden-bras",
        label:
          "Hidden bra cups (if listed) are present and intact",
        why: "Sewn-in cups make the dress wearable without a separate bra; if they've been removed, that's a $40–80 alterations cost.",
      },
      {
        id: "hem-even",
        label: "Hem is even all the way around",
        why: "An uneven hem usually means the dress was altered for someone shorter than you. Re-leveling is $80+ on lined fabric.",
      },
      {
        id: "fit-sitting",
        label:
          "Try it on STANDING and SITTING — both should be comfortable",
        why: "A dress that fits standing can split a side seam during the speeches. Most engagement-photo regret starts at table four.",
      },
      {
        id: "matches-photos",
        label:
          "The dress in your hands looks like the dress in the listing photos",
        why: "Filtered photos and brand-website stock images are the two biggest sources of buyer disappointment.",
      },
    ],
  },
];
