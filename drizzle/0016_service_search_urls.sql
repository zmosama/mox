-- The search URLs behind the Play button, used where JustWatch has no link for
-- a title. Every one of these was wrong. Each had been patched in the past by a
-- throwaway script run straight against production, which is why none of them
-- were ever recorded. Verified by opening them, 2026-10-01.

-- Shahid searches on `term`, not `q`, and adds its own locale. With `q` the
-- page loaded, searched nothing, and showed an empty screen.
UPDATE `services` SET `search_url` = 'https://shahid.mbc.net/search?term={q}' WHERE `provider_id` = 1715;--> statement-breakpoint

-- Without a region Apple redirects to the American store, which does not carry
-- what the Egyptian one does.
UPDATE `services` SET `search_url` = 'https://tv.apple.com/eg/search?term={q}' WHERE `provider_id` IN (2, 350);--> statement-breakpoint

-- Disney+ has no public search route at all: /search, /browse/search and
-- /en-eg/search every one answers 404 signed out. The Egyptian home page is the
-- honest destination — a front door beats a 404.
UPDATE `services` SET `search_url` = 'https://www.disneyplus.com/en-eg' WHERE `provider_id` = 337;
