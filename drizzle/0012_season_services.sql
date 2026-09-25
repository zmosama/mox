CREATE TABLE `season_services` (
	`tmdb_id` integer NOT NULL,
	`season` integer NOT NULL,
	`services` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tmdb_id`, `season`)
);
