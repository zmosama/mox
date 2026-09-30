-- Forget every "asked, nothing found" recorded so far.
--
-- The step that wrote them could not tell a page that answered "no offer" from
-- one that could not be fetched at all — hundreds at a time got throttled, and
-- every throttled title was written off for a month. Checked by hand afterwards,
-- four of six such titles had the offer on the page all along.
--
-- Only the marks are cleared. A link that was found is a fact and stays.
UPDATE `availability` SET `linked_at` = NULL WHERE `deep_link` IS NULL;
