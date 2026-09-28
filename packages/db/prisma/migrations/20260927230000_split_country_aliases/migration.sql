-- Split countries.aliases into the three things it was holding at once (#35).
--
-- The old column mixed other names for the COUNTRY with other names for the
-- CAPITAL and with cities that are neither, and the answer matcher consulted
-- the whole array whichever way the question was asked — so "the capital of
-- Australia is Oz" and "the capital of Israel is Tel Aviv" were both marked
-- correct.
--
-- The new columns start EMPTY rather than inheriting the old array. Copying it
-- into any one of them would carry the bug forward (into the capital domain) or
-- assert something false (Cape Town as another name for South Africa) until the
-- seed runs. Empty is merely less forgiving: canonical values and the pg_trgm
-- fuzzy pass still work. `pnpm db:seed` refills all three from
-- packages/shared/src/countries.ts, upserting on iso_code, so no progress row
-- is touched.
ALTER TABLE "countries" ADD COLUMN "name_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "countries" ADD COLUMN "capital_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "countries" ADD COLUMN "search_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "countries" DROP COLUMN "aliases";
