CREATE TABLE `catalog_people` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`profile_path` text,
	`department` text,
	`popularity` real,
	`imdb_id` text,
	`detail` text,
	`detail_at` integer,
	`seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_people_popularity` ON `catalog_people` (`popularity`);--> statement-breakpoint
CREATE TABLE `catalog_titles` (
	`tmdb_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`original_title` text,
	`year` integer,
	`release_date` text,
	`poster_path` text,
	`backdrop_path` text,
	`overview` text,
	`rating` real,
	`votes` integer,
	`popularity` real,
	`lang` text,
	`genres` text,
	`companies` text,
	`networks` text,
	`imdb_id` text,
	`status` text,
	`age_level` text,
	`age_checked_at` integer,
	`detail` text,
	`detail_at` integer,
	`seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`tmdb_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `catalog_titles_popularity` ON `catalog_titles` (`popularity`);--> statement-breakpoint
CREATE INDEX `catalog_titles_imdb` ON `catalog_titles` (`imdb_id`);--> statement-breakpoint
CREATE INDEX `catalog_titles_detail` ON `catalog_titles` (`detail_at`);