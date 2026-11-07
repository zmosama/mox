CREATE TABLE `mox_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mox_memories_user` ON `mox_memories` (`user_id`);--> statement-breakpoint
CREATE TABLE `mox_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mox_messages_user` ON `mox_messages` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `mox_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`soul` text,
	`chat_model` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vitals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`value` real NOT NULL,
	`rating` text,
	`path` text NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vitals_at` ON `vitals` (`at`);--> statement-breakpoint
ALTER TABLE `news_items` ADD `section` text DEFAULT 'screen' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_items` ADD `title_ar` text;--> statement-breakpoint
ALTER TABLE `news_items` ADD `summary_ar` text;--> statement-breakpoint
ALTER TABLE `news_items` ADD `translated_at` integer;--> statement-breakpoint
CREATE INDEX `news_section` ON `news_items` (`section`,`published_at`);