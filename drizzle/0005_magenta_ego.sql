ALTER TABLE `universes` ADD `collection` integer;--> statement-breakpoint
-- What each universe is made of, so membership can be rebuilt from TMDB rather
-- than hand-maintained. Every one of these was a fixed list frozen at import:
-- the MCU stopped at whatever had been released that week.
UPDATE `universes` SET `keyword` = 180547 WHERE `slug` = 'mcu';--> statement-breakpoint
UPDATE `universes` SET `keyword` = 229266 WHERE `slug` = 'dceu';--> statement-breakpoint
UPDATE `universes` SET `keyword` = 312528 WHERE `slug` = 'dcu';--> statement-breakpoint
UPDATE `universes` SET `keyword` = 329136 WHERE `slug` = 'dc_animated';--> statement-breakpoint
UPDATE `universes` SET `keyword` = 380322 WHERE `slug` = 'monsterverse';--> statement-breakpoint
-- Bond is a closed set of films, not a theme; the keyword "james bond" also
-- catches spoofs and anything that merely references him.
UPDATE `universes` SET `collection` = 645 WHERE `slug` = 'bond';
