import UIKit

/// What pressing Play can do for a title on one service, on an Apple TV.
///
/// There is no browser here: a link either belongs to an installed app or
/// goes nowhere. The rules for Netflix, Prime Video, Apple TV, Disney+, Shahid,
/// OSN+ and STARZPLAY are what each app did with the link on a real Apple TV
/// 4K on 2026-11-18 — the simulator has none of these apps. Shahid's /player/
/// link was only seen as far as its profile picker. TOD took its link and what
/// it showed could not be captured; it and any service not named here are
/// `.untried`, and the button says no more than that.
struct TVLink {
    enum Landing {
        /// The app opens on this title's page.
        case title
        /// The app opens and starts playing.
        case plays
        /// The app takes the link; where it lands has not been seen.
        case untried
        /// The app opens, but not on the title: it has to be searched for there.
        case appOnly
        /// Nothing MOX can open; the app has to be opened by hand.
        case none
    }

    let url: URL?
    let landing: Landing

    static func target(for platform: Platform) -> TVLink {
        guard let raw = platform.url, var parts = URLComponents(string: raw),
              let host = parts.host?.lowercased() else {
            return home(of: platform.name)
        }
        let path = parts.path

        switch true {
        case host.hasSuffix("netflix.com"):
            // A Netflix link is only followed when it says it came from the
            // Top Shelf; without that the app opens wherever it was.
            guard path.hasPrefix("/title/") else { return home(of: platform.name) }
            var items = parts.queryItems ?? []
            items.removeAll { $0.name == "source" }
            items.append(URLQueryItem(name: "source", value: "topshelf"))
            parts.queryItems = items
            return TVLink(url: parts.url, landing: .title)

        case host == "app.primevideo.com":
            return TVLink(url: parts.url, landing: path.hasPrefix("/detail") ? .title : .appOnly)

        case host == "tv.apple.com":
            let title = ["/show/", "/movie/", "/episode/"].contains { path.contains($0) }
            // Apple's search link opens its search with the name typed in.
            return TVLink(url: parts.url, landing: title ? .title : .appOnly)

        case host.hasSuffix("disneyplus.com"):
            guard path.contains("/browse/entity-") else { return home(of: platform.name) }
            return TVLink(url: parts.url, landing: .title)

        case host == "shahid.mbc.net":
            if path.contains("/player/") { return TVLink(url: parts.url, landing: .plays) }
            guard path.contains("/series/") || path.contains("/movies/") || path.contains("/shows/") else {
                return home(of: platform.name)
            }
            return TVLink(url: parts.url, landing: .title)

        case host.hasSuffix("osnplus.com"):
            if path.contains("/episode/") { return TVLink(url: parts.url, landing: .plays) }
            guard path.contains("/series/") || path.contains("/movies/") || path.contains("/movie/") else {
                return home(of: platform.name)
            }
            return TVLink(url: parts.url, landing: .title)

        case host.hasSuffix("starzplay.com"):
            // Its title link opened the app on its own home, not on the title.
            return TVLink(url: parts.url, landing: .appOnly)

        default:
            // TOD, and any service nobody has tried on a television. Its own
            // title link is worth the attempt; a web search page is not.
            let search = path.contains("search") || host.contains("duckduckgo") || host.contains("google")
            return search ? home(of: platform.name) : TVLink(url: parts.url, landing: .untried)
        }
    }

    /// A link that only brings the service's app forward, where one is known.
    private static func home(of service: String) -> TVLink {
        let name = service.lowercased()
        let link: String? = switch true {
        case name.contains("netflix"): "https://www.netflix.com/browse"
        case name.contains("prime"): "https://app.primevideo.com/"
        case name.contains("disney"): "https://www.disneyplus.com/"
        case name.contains("apple"): "https://tv.apple.com/"
        default: nil
        }
        guard let link, let url = URL(string: link) else { return TVLink(url: nil, landing: .none) }
        return TVLink(url: url, landing: .appOnly)
    }

    /// Hand the link to its app. False when no installed app took it.
    @MainActor
    func open() async -> Bool {
        guard let url else { return false }
        return await UIApplication.shared.open(url)
    }
}
