-- The catalogue's own titles found by the start of any word as it is typed,
-- from an index: search used to scan all of catalog_titles with
-- lower(title) like '%word%' on every keystroke, a second each time.
-- It reads catalog_titles itself; the triggers keep it in step.
CREATE VIRTUAL TABLE `catalog_title_search` USING fts5(`title`, `original_title`, content='catalog_titles', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `catalog_title_search`(`catalog_title_search`) VALUES('rebuild');
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_ai` AFTER INSERT ON `catalog_titles` BEGIN
  INSERT INTO `catalog_title_search`(rowid, `title`, `original_title`) VALUES (new.rowid, new.`title`, new.`original_title`);
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_ad` AFTER DELETE ON `catalog_titles` BEGIN
  INSERT INTO `catalog_title_search`(`catalog_title_search`, rowid, `title`, `original_title`) VALUES ('delete', old.rowid, old.`title`, old.`original_title`);
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_au` AFTER UPDATE OF `title`, `original_title` ON `catalog_titles` BEGIN
  INSERT INTO `catalog_title_search`(`catalog_title_search`, rowid, `title`, `original_title`) VALUES ('delete', old.rowid, old.`title`, old.`original_title`);
  INSERT INTO `catalog_title_search`(rowid, `title`, `original_title`) VALUES (new.rowid, new.`title`, new.`original_title`);
END;
