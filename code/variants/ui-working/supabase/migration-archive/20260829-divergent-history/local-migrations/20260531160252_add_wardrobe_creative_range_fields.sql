-- Add broad creative-direction fields for wardrobe collections.
-- Existing exact garment fields remain for backwards compatibility, but the UI and prompt builder now prefer these style-range fields.

alter table public.ai_model_outfits
  add column if not exists fashion_dna text,
  add column if not exists allowed_silhouettes text,
  add column if not exists allowed_materials text,
  add column if not exists allowed_colour_families text,
  add column if not exists footwear_direction text;
-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

-- Public export: original data/backfill payload omitted; schema/function definitions retained.

