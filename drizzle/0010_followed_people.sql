CREATE TABLE `followed_people` (
	`user_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`name` text NOT NULL,
	`profile` text,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `person_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
