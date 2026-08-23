ALTER TABLE `users` ADD `is_owner` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_owner` ON `users` (`is_owner`) WHERE `is_owner` = 1;
