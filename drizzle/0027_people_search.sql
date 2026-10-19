-- People found by any word of their name as it is typed ("bra pi" → Brad Pitt),
-- from an index instead of a scan of every name on every keystroke. It reads
-- catalog_people itself; the triggers keep it in step.
CREATE VIRTUAL TABLE `people_search` USING fts5(`name`, content='catalog_people', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `people_search`(`people_search`) VALUES('rebuild');
--> statement-breakpoint
CREATE TRIGGER `people_search_ai` AFTER INSERT ON `catalog_people` BEGIN
  INSERT INTO `people_search`(rowid, `name`) VALUES (new.`id`, new.`name`);
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_ad` AFTER DELETE ON `catalog_people` BEGIN
  INSERT INTO `people_search`(`people_search`, rowid, `name`) VALUES ('delete', old.`id`, old.`name`);
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_au` AFTER UPDATE OF `name` ON `catalog_people` BEGIN
  INSERT INTO `people_search`(`people_search`, rowid, `name`) VALUES ('delete', old.`id`, old.`name`);
  INSERT INTO `people_search`(rowid, `name`) VALUES (new.`id`, new.`name`);
END;
