CREATE TABLE `user_services` (
	`user_id` integer NOT NULL,
	`provider_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `services`(`provider_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `services` ADD `priority` integer DEFAULT 999 NOT NULL;
-- The users_single_owner index drizzle wanted to add here is already in place:
-- 0001 created it. Re-creating it aborts the migration and with it the deploy.