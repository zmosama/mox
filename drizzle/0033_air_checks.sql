-- The nightly second opinion on episode dates: MOX's calendar for the shows
-- the owner follows, held against pogdesign's TV Calendar. One row a night.
CREATE TABLE `air_checks` (
	`day` text PRIMARY KEY NOT NULL,
	`ran_at` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`agreed` integer DEFAULT 0 NOT NULL,
	`summary_ar` text NOT NULL,
	`findings` text DEFAULT '[]' NOT NULL
);
