# Putting Cloudflare in front of mox

**Live since 2026-11-07:** `mox` is proxied (orange). SSL was already Full
(strict) for the whole zone and Bot Fight Mode was already off — the zone
also carries the main site, the blog and the tunnels, so neither is a
mox-only switch: change them only with those in mind. Checked after the
switch: pages and APIs 200 through Cloudflare, an iOS-style request 200,
`/api/img` served `HIT` from the edge on the second request.

`mosama.me`'s DNS is already on Cloudflare, but `mox.mosama.me` is DNS only
(grey cloud): it answers with the VPS's own address. Turning the proxy on
(orange cloud) is a change on Cloudflare and in Caddy, not in the app — and
three things must be right first, or the site breaks in ways that are hard to
see.

## 1. Caddy must know the visitor, not Cloudflare — DONE 2026-11-07

`src/lib/rate-limit.ts` limits by `X-Forwarded-For`. Behind Cloudflare every
request arrives from one of Cloudflare's addresses, so without this every
visitor shares one bucket and the limiter locks everyone out together.

The VPS runs Caddy **2.6.2**, which has `trusted_proxies` but not
`client_ip_headers` or `{client_ip}` (both 2.7). So the mox block matches
Cloudflare's own addresses and takes the visitor from `CF-Connecting-IP` only
for those; anything else gets the address that actually connected. Either
way the header the app reads is *replaced*, never appended to, so nothing a
client sends survives:

```
mox.mosama.me {
	encode zstd gzip
	@cloudflare remote_ip 173.245.48.0/20 103.21.244.0/22 … 2c0f:f248::/32
	reverse_proxy @cloudflare 127.0.0.1:8782 {
		header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
		header_up X-Real-IP {http.request.header.CF-Connecting-IP}
	}
	reverse_proxy 127.0.0.1:8782 {
		header_up X-Forwarded-For {http.request.remote.host}
		header_up X-Real-IP {http.request.remote.host}
	}
}
```

The full range list is in `/etc/caddy/Caddyfile` (from
https://www.cloudflare.com/ips/ — it changes rarely; recheck yearly). Tested
on the VPS with a throwaway Caddy: a direct request sending fake
`X-Forwarded-For` and `CF-Connecting-IP` reached the app as its real address;
a request from a "Cloudflare" address reached it as the `CF-Connecting-IP`.
The previous file is `/etc/caddy/Caddyfile.bak-202611071346`.

Do **not** read `CF-Connecting-IP` in the app: anyone can send that header
straight to the VPS. Caddy only believes it from Cloudflare's addresses.

## 2. SSL: Full (strict)

Cloudflare → SSL/TLS → **Full (strict)**. Flexible sends plain HTTP to Caddy,
Caddy redirects to HTTPS, and the browser loops. Caddy keeps its own Let's
Encrypt certificate; check it still renews (`journalctl -u caddy | grep -i
certificate`) a day after switching.

## 3. The iPhone app is not a browser

Security → Bots: **Bot Fight Mode off**, and no challenge rules on `/api/*`.
The app's requests carry no browser to solve a challenge; they would just fail.

## Then

Switch only `mox` to orange; leave the other sites on the VPS as they are.

`/api/img/…` ends in the picture's extension (.jpg/.webp/.png) and is
`immutable` for a year, so Cloudflare keeps it at the edge by default. So does
`/api/news/img/….webp`. `/api/avatar/{id}?v=…` has no extension, and
Cloudflare's default cache skips it whatever `Cache-Control` says: add a Cache
Rule (Caching → Cache Rules) — URI path starts with `/api/avatar/` → eligible
for cache, edge TTL from the origin's header — keeping the query string in
the key (the default), so a new `?v=` is a new copy.
