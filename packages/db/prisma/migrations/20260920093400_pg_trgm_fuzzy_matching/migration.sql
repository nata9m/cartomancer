-- Fuzzy answer matching support.
--
-- Answer checking is exact-first, fuzzy-second:
--   1. normalised equality against the canonical value or a hand-seeded alias
--   2. pg_trgm similarity above the app's threshold, and only when the expected
--      country is the single best trigram match in the whole table
-- Step 2 needs a normalised, index-backed comparison key, which is what
-- cartomancer_normalize() below provides.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Mirrors normalizeAnswer() in @cartomancer/shared so the SQL and TS passes
-- agree. Diacritics are folded with translate() rather than the unaccent
-- extension, deliberately: translate() is IMMUTABLE (so it can back an index)
-- and it keeps the cluster's Postgres down to a single required extension.
CREATE OR REPLACE FUNCTION cartomancer_normalize(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            replace(
              replace(
                translate(
                  lower(value),
                  'àáâãäåāăąæçćĉċčďđðèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľłŀñńņňŉòóôõöøōŏőŕŗřśŝşšșţťŧțùúûüũūŭůűųŵýÿŷźżžþ',
                  'aaaaaaaaaacccccdddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnooooooooorrrsssssttttuuuuuuuuuuwyyyzzzt'
                ),
                'ß', 'ss'
              ),
              '&', ' and '
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '\yst\y', 'saint', 'g'
        ),
        '\ythe\y', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- Trigram indexes on the two canonical answer fields, over the normalised form
-- so the index is usable by the similarity queries the API actually runs.
CREATE INDEX "countries_name_trgm_idx"
  ON "countries" USING gin (cartomancer_normalize("name") gin_trgm_ops);

CREATE INDEX "countries_capital_trgm_idx"
  ON "countries" USING gin (cartomancer_normalize("capital") gin_trgm_ops);

-- Array containment for the hand-seeded alias lists (exact alias lookups).
-- Fuzzy matching against aliases runs over unnest(aliases), which cannot use
-- this index; with 195 rows that scan is immaterial, and if the alias lists ever
-- grow large the fix is a normalised alias table, not another index here.
CREATE INDEX "countries_aliases_gin_idx" ON "countries" USING gin ("aliases");
