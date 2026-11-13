-- Nature / type of the matter (distinct from court tier in `category`).
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_category text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.cases.case_category IS
  'Matter type, e.g. Civil, Criminal, Family — see API enum caseCategory.';
