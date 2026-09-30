const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const url = "https://www.themoviedb.org/tv/37854/watch?locale=EG";
const res = await fetch(url, { headers: { "user-agent": UA } });
const html = await res.text();
console.log("status", res.status, "bytes", html.length);
console.log("cx= payloads:", [...html.matchAll(/cx=([A-Za-z0-9_\-%]+)/g)].length);
// provider links on the page
const links = [...html.matchAll(/href="(https?:\/\/[^"]*(?:netflix|shahid|osn|tod|starz|disney|primevideo|apple)[^"]*)"/gi)]
  .map(m => m[1]).slice(0, 6);
console.log("direct provider links:", links.length ? links : "(none)");
const jw = [...html.matchAll(/justwatch[^"']{0,80}/gi)].slice(0,3).map(m=>m[0]);
console.log("justwatch mentions:", jw);
