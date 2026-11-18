-- The catalogue's titles are found as people type them, not as they are
-- spelt: "الفيل الازرق" must find "الفيل الأزرق", and "الهيبه" must find
-- "الهيبة". The index of 0028 held the titles as written, so Arabic typed
-- without its hamza found nothing — and Arabic was sent to TMDB instead.
-- Search no longer asks TMDB for anything, so the index folds the letters
-- itself, the same way src/lib/arabic.ts folds what is typed.
--
-- It keeps no copy of the text (the catalogue has it), only the words.
DROP TRIGGER IF EXISTS `catalog_title_search_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `catalog_title_search_ad`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `catalog_title_search_au`;
--> statement-breakpoint
DROP TABLE IF EXISTS `catalog_title_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `catalog_title_search` USING fts5(`title`, `original_title`, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `catalog_title_search`(rowid, `title`, `original_title`) SELECT rowid, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ',''), replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`original_title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ','') FROM `catalog_titles`;
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_ai` AFTER INSERT ON `catalog_titles` BEGIN
  INSERT INTO `catalog_title_search`(rowid, `title`, `original_title`) VALUES (new.rowid, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(new.`title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ',''), replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(new.`original_title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ',''));
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_ad` AFTER DELETE ON `catalog_titles` BEGIN
  DELETE FROM `catalog_title_search` WHERE rowid = old.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER `catalog_title_search_au` AFTER UPDATE OF `title`, `original_title` ON `catalog_titles` BEGIN
  DELETE FROM `catalog_title_search` WHERE rowid = old.rowid;
  INSERT INTO `catalog_title_search`(rowid, `title`, `original_title`) VALUES (new.rowid, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(new.`title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ',''), replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(new.`original_title`,'أ','ا'),'إ','ا'),'آ','ا'),'ٱ','ا'),'ة','ه'),'ى','ي'),'ؤ','و'),'ئ','ي'),'ً',''),'ٌ',''),'ٍ',''),'َ',''),'ُ',''),'ِ',''),'ّ',''),'ْ',''),'ٰ',''),'ـ',''));
END;
