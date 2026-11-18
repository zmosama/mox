-- Search fetched the catalogue's own rows, and those rows carry each title's
-- whole record: the table had grown to 816MB on a server with 2GB of memory.
-- Typing "th" matched 58,786 titles and fetched every one of them from that
-- table to ask its year — twenty seconds whenever the table was not all in
-- memory, which on that server is most of the time.
--
-- These two hold only what a search result shows, about 20MB each. The broad
-- questions ("which of these thousands are from this year", "which are the
-- best-known faces") are answered from them alone; the rows are then read
-- only for the couple of hundred titles that made the list.
CREATE INDEX `catalog_people_faces` ON `catalog_people` (`popularity`,`name`,`profile_path`,`department`) WHERE profile_path is not null;--> statement-breakpoint
CREATE INDEX `catalog_titles_recent` ON `catalog_titles` (`year`,`popularity`,`tmdb_id`,`kind`,`title`,`original_title`,`poster_path`,`rating`,`votes`);
