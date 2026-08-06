w-- Add a per-row date column to operation_items so each line can keep its own date.
ALTER TABLE public.operation_items
ADD COLUMN IF NOT EXISTS date DATE;

-- Backfill existing rows from the parent operation date when the row has no explicit date.
UPDATE public.operation_items AS oi
SET date = o.date
FROM public.operations AS o
WHERE oi.operation_id = o.id
  AND oi.date IS NULL
  AND o.date IS NOT NULL;

-- Make the column non-null for future inserts where a date is required.
ALTER TABLE public.operation_items
ALTER COLUMN date SET DEFAULT NULL;
