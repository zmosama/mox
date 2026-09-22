CREATE TABLE `store_items` (
	`provider_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`first_seen` text NOT NULL,
	PRIMARY KEY(`provider_id`, `tmdb_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `store_items_first_seen` ON `store_items` (`first_seen`);