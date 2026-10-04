CREATE TABLE `imdb_map` (
	`imdb_id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer,
	`kind` text,
	`checked_at` integer DEFAULT (unixepoch()) NOT NULL
);
