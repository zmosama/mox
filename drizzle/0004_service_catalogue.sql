-- The service catalogue people choose from on /admin/services.
--
-- Shipped as data rather than fetched at deploy time: a deploy that needs
-- TMDB to answer is a deploy that fails when TMDB is down. Refresh it later
-- with `npm run sync:services`, which regenerates these rows from the API.
--
-- Existing rows keep their search_url and regions — those are hand-written
-- and TMDB does not know them. Disney Plus is not listed for Egypt at all;
-- it is read from other regions and must survive this.
-- Statements are separated by the breakpoint marker Drizzle's migrator splits
-- on. Without it the whole file is handed to SQLite as one string, which the
-- CLI tolerates and the library rejects — the same migration behaving two
-- different ways depending on who applies it.
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (8, 'netflix', 'Netflix', 'https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg', 0) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (119, 'prime_video', 'Amazon Prime Video', 'https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg', 1) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (350, 'apple_tv', 'Apple TV', 'https://image.tmdb.org/t/p/w92/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg', 2) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (393, 'flixol', 'FlixOlé', 'https://image.tmdb.org/t/p/w92/ozMgkAAoi6aDI5ce8KKA2k8TGvB.jpg', 2) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (3, 'google_play_movies', 'Google Play Movies', 'https://image.tmdb.org/t/p/w92/8z7rC8uIDaTM91X0ZfkRf04ydj2.jpg', 2) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (232, 'zee5', 'Zee5', 'https://image.tmdb.org/t/p/w92/gP67NRy1ShUJilrzMsbOmEmdmcv.jpg', 2) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2, 'apple_tv_store', 'Apple TV Store', 'https://image.tmdb.org/t/p/w92/SPnB1qiCkYfirS2it3hZORwGVn.jpg', 3) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (701, 'filmbox', 'FilmBox+', 'https://image.tmdb.org/t/p/w92/fbveJTcro9Xw2KuPIIoPPePHiwy.jpg', 3) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (309, 'sun_nxt', 'Sun Nxt', 'https://image.tmdb.org/t/p/w92/6KEQzITx2RrCAQt5Nw9WrL1OI8z.jpg', 3) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2285, 'justwatch_tv', 'JustWatch TV', 'https://image.tmdb.org/t/p/w92/y2wjCLxPrzPbghH07Sekqw5D1bE.jpg', 4) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (638, 'public_domain_movies', 'Public Domain Movies', 'https://image.tmdb.org/t/p/w92/aN0Y2BNZQBH91JkVOeLTs8IhQrH.jpg', 5) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (677, 'eventive', 'Eventive', 'https://image.tmdb.org/t/p/w92/fwx5Ed64TkfWiRH1SOSkc4781Ts.jpg', 6) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (534, 'argo', 'Argo', 'https://image.tmdb.org/t/p/w92/jQMOpRluniNQSEp6V7IvtKxXMW.jpg', 7) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (692, 'cultpix', 'Cultpix', 'https://image.tmdb.org/t/p/w92/uauVx3dGWt0GICqdMCBYJObd3Mo.jpg', 7) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2478, 'found_tv', 'FOUND TV', 'https://image.tmdb.org/t/p/w92/mD3KV7olfMJOBxJqKKPjvNrpVJF.jpg', 7) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (11, 'mubi', 'MUBI', 'https://image.tmdb.org/t/p/w92/x570VpH2C9EKDf1riP83rYc5dnL.jpg', 8) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (190, 'curiosity_stream', 'Curiosity Stream', 'https://image.tmdb.org/t/p/w92/oR1aNm1Qu9jQBkW4VrGPWhqbC3P.jpg', 9) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (704, 'irokotv', 'IROKOTV', 'https://image.tmdb.org/t/p/w92/4bsFc5AgxDNdDeS1NIjVRviARhB.jpg', 9) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (532, 'aha', 'aha', 'https://image.tmdb.org/t/p/w92/8WerMI8XcZXqPpkHTZNtzMzousF.jpg', 9) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2603, 'kableone', 'KableOne', 'https://image.tmdb.org/t/p/w92/nOE9GjiyF5UhUVRJ2yGSzdCh0ec.jpg', 10) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (1715, 'shahid_vip', 'Shahid VIP', 'https://image.tmdb.org/t/p/w92/7qZED0kLBtiV8mLRNBtW4PQCAqW.jpg', 10) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2620, 'caixaforum', 'CaixaForum+', 'https://image.tmdb.org/t/p/w92/9pRY14ZWkDCRzQBuASRnYJ1KZwQ.jpg', 11) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (1771, 'takflix', 'Takflix', 'https://image.tmdb.org/t/p/w92/ed0vz5bryWIhQB5sHiuGvHKnHHn.jpg', 11) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (283, 'crunchyroll', 'Crunchyroll', 'https://image.tmdb.org/t/p/w92/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg', 12) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (551, 'magellan_tv', 'Magellan TV', 'https://image.tmdb.org/t/p/w92/mSH24WQcRDJ2fsL5iucXqqRnSRb.jpg', 12) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2685, 'artify', 'Artify', 'https://image.tmdb.org/t/p/w92/rQqxsXq63XsDY8xcabqBWU5WWbw.jpg', 13) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (554, 'broadwayhd', 'BroadwayHD', 'https://image.tmdb.org/t/p/w92/6IYZ4NjwPikxN7J9cfSmuyeHeMm.jpg', 13) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (559, 'filmzie', 'Filmzie', 'https://image.tmdb.org/t/p/w92/eUBxtrqO26wAJfYOZJOzhQEo3mm.jpg', 13) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2330, 'jolt_film', 'Jolt Film', 'https://image.tmdb.org/t/p/w92/sBTV0rN8JUhF4G3uIceinWtQ3gi.jpg', 14) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (567, 'true_story', 'True Story', 'https://image.tmdb.org/t/p/w92/aRPDQvVcpeY07sjI6lAALMCL0ti.jpg', 15) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2555, 'bloodstream', 'Bloodstream', 'https://image.tmdb.org/t/p/w92/qlsnWCrmcisQH5JnEDxPV2v2vlb.jpg', 17) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (315, 'hoichoi', 'Hoichoi', 'https://image.tmdb.org/t/p/w92/u7dwMceEbjxd1N3TLEUBILSK2x6.jpg', 17) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2565, 'movieme', 'MovieMe', 'https://image.tmdb.org/t/p/w92/zODyP8gGRnp3Gd23FhXhQwIpLie.jpg', 18) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (344, 'rakuten_viki', 'Rakuten Viki', 'https://image.tmdb.org/t/p/w92/73uV3YooOA8gD9YQTXFj2XakZWA.jpg', 18) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (581, 'iqiyi', 'iQIYI', 'https://image.tmdb.org/t/p/w92/c4eVkfMna2VzHzZ8N2vWXUnMrlD.jpg', 19) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (2623, 'artiflix', 'Artiflix', 'https://image.tmdb.org/t/p/w92/5MsbQCp7FpYr3INLpeKDLJrlDh8.jpg', 21) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (629, 'osn_plus', 'OSN+', 'https://image.tmdb.org/t/p/w92/kC6JTo59Gj6I4vJPyBAYGh0sKAE.jpg', 21) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (511, 'iwant', 'iWant', 'https://image.tmdb.org/t/p/w92/jb38w281Douk6kXy1iVB2L7FJTN.jpg', 22) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (1750, 'tod', 'TOD', 'https://image.tmdb.org/t/p/w92/bFxDjHDXP02u1dLPZfTsTC1L6EA.jpg', 24) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (498, 'south_park', 'South Park', 'https://image.tmdb.org/t/p/w92/9kxo34bWuDJcGvNQBlSY4o6OujZ.jpg', 28) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (630, 'starzplay', 'STARZPLAY', 'https://image.tmdb.org/t/p/w92/pDroY6RxYdVw63eAepag4b116Ub.jpg', 36) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (1958, 'ad_tv', 'AD tv', 'https://image.tmdb.org/t/p/w92/mK8nfCXfwoAa6cAkHUSKCkLEIKK.jpg', 162) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
--> statement-breakpoint
INSERT INTO `services` (`provider_id`, `slug`, `name`, `logo`, `priority`) VALUES (337, 'disney_plus', 'Disney Plus', 'https://image.tmdb.org/t/p/w92/97yvRBw1GzX7fXprcF80er19ot.jpg', 999) ON CONFLICT(`provider_id`) DO UPDATE SET `name` = excluded.`name`, `logo` = excluded.`logo`, `priority` = excluded.`priority`;
