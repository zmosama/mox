CREATE TABLE `watch_links` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`links` text NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`)
);
