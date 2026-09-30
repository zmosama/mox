-- The Play button's URL is now a per-service rule in src/lib/play-links.ts,
-- computed when it is asked for. See that file for why.

-- Undo the scraper. It filled 135 rows of `deep_link` from JustWatch clickouts,
-- and for series those were pinned to one arbitrary episode — Friends to a single
-- OSN episode, America's Got Talent to S20E1 — so they went stale the day a new
-- season aired. It only ever added: the 14 rows below predate it and were chosen
-- by hand, and are kept. Taken from the backup of 2026-09-30 05:00, before it ran.
UPDATE `availability` SET `deep_link` = NULL
WHERE `deep_link` IS NOT NULL
  AND (`tmdb_id` || ':' || `kind` || ':' || `provider`) NOT IN (
    '1812:movie:Amazon Prime Video',
    '108978:tv:Amazon Prime Video',
    '113962:tv:STARZPLAY',
    '125988:tv:Apple TV',
    '278624:tv:Apple TV',
    '287238:tv:Disney Plus',
    '291496:tv:Netflix',
    '300480:tv:Netflix',
    '309798:tv:Netflix',
    '327814:tv:Netflix',
    '328735:tv:Netflix',
    '1284041:movie:Netflix',
    '1361774:movie:Apple TV',
    '1659155:movie:Netflix'
  );--> statement-breakpoint

-- The scraper's bookkeeping, and the search URLs that now live in code.
ALTER TABLE `availability` DROP COLUMN `linked_at`;--> statement-breakpoint
ALTER TABLE `services` DROP COLUMN `search_url`;
