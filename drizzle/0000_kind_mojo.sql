CREATE TABLE `availability` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`region` text NOT NULL,
	`mine` integer DEFAULT false NOT NULL,
	`deep_link` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`, `provider`, `region`)
);
--> statement-breakpoint
CREATE INDEX `availability_mine` ON `availability` (`mine`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`show` text NOT NULL,
	`season` integer NOT NULL,
	`episode` integer NOT NULL,
	`airs` text NOT NULL,
	`tmdb_id` integer,
	PRIMARY KEY(`show`, `season`, `episode`)
);
--> statement-breakpoint
CREATE INDEX `episodes_airs` ON `episodes` (`airs`);--> statement-breakpoint
CREATE TABLE `features` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`feature` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`, `feature`, `value`)
);
--> statement-breakpoint
CREATE INDEX `features_lookup` ON `features` (`feature`,`value`);--> statement-breakpoint
CREATE TABLE `feed_items` (
	`feed` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`built_at` text NOT NULL,
	PRIMARY KEY(`feed`, `tmdb_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `feed_pos` ON `feed_items` (`feed`,`position`);--> statement-breakpoint
CREATE TABLE `follows` (
	`user_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `overrides` (
	`key` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer,
	`kind` text DEFAULT 'tv' NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `services` (
	`provider_id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`logo` text,
	`search_url` text,
	`regions` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `similars` (
	`source_id` integer NOT NULL,
	`source_kind` text NOT NULL,
	`target_id` integer NOT NULL,
	`target_title` text NOT NULL,
	`rank` integer NOT NULL,
	PRIMARY KEY(`source_id`, `source_kind`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `similars_target` ON `similars` (`target_id`);--> statement-breakpoint
CREATE TABLE `surfaced` (
	`user_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`shown_on` text NOT NULL,
	PRIMARY KEY(`user_id`, `tmdb_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `titles` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`release_date` text,
	`poster` text,
	`backdrop` text,
	`overview` text,
	`rating` real,
	`votes` integer,
	`lang` text,
	`runtime` integer,
	`collection` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `titles_kind_year` ON `titles` (`kind`,`year`);--> statement-breakpoint
CREATE TABLE `universe_titles` (
	`slug` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`slug`, `tmdb_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `universes` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`keyword` integer,
	`company` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `verdicts` (
	`user_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`verdict` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `tmdb_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verdicts_user_v` ON `verdicts` (`user_id`,`verdict`);