-- Add per-row date support for operation items.
-- This allows each line of an operation to keep its own date when saved.
ALTER TABLE public.operation_items
ADD COLUMN IF NOT EXISTS date text;

-- Populate date on existing rows from their parent operation when missing.
UPDATE public.operation_items
SET date = o.date
FROM public.operations AS o
WHERE operation_items.operation_id = o.id
  AND operation_items.date IS NULL;

-- Optional index for filtering and ordering by the item-level date.
CREATE INDEX IF NOT EXISTS idx_operation_items_date ON public.operation_items (date);
