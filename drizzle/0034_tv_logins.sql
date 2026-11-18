-- An Apple TV asking to be signed in: the code it shows, the hash of the secret
-- only it holds, and — once approved from a signed-in phone — whose it is.
CREATE TABLE `tv_logins` (
	`code` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`user_id` integer,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_logins_secret_hash_unique` ON `tv_logins` (`secret_hash`);
