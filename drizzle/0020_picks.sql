CREATE TABLE `picks` (
	`user_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real NOT NULL,
	`reason` text,
	`built_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `tmdb_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `picks_user_rank` ON `picks` (`user_id`,`rank`);