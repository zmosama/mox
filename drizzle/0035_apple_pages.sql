-- A film's page on Apple's store here, found by asking Apple directly: TMDB
-- hears of a store listing days late and of a pre-order never.
CREATE TABLE `apple_pages` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`url` text,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`)
);
