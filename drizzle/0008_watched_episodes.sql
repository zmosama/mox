CREATE TABLE `watched_episodes` (
	`user_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer NOT NULL,
	`episode` integer NOT NULL,
	`watched_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `tmdb_id`, `season`, `episode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
