CREATE TABLE `f1_watched` (
	`user_id` integer NOT NULL,
	`season` integer NOT NULL,
	`round` integer NOT NULL,
	`watched_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `season`, `round`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `news_items` (
	`url` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`lang` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`image` text,
	`categories` text,
	`published_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `news_published` ON `news_items` (`published_at`);--> statement-breakpoint
ALTER TABLE `availability` ADD `first_seen` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `prefs` text;