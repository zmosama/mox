import Foundation

// Shapes returned by the mox server. They mirror the TypeScript types in
// src/lib/queries.ts; every field the server may omit is optional here.

nonisolated struct Platform: Codable, Hashable, Sendable {
    let name: String
    let logo: String?
    let url: String?
}

nonisolated struct Card: Codable, Hashable, Sendable, Identifiable {
    let tmdbId: Int
    let kind: String
    let title: String
    let year: Int?
    let poster: String?
    let rating: Double?
    let verdict: String?
    let platforms: [Platform]
    let episodeLabel: String?
    let releaseLabel: String?
    let price: String?
    let date: String?
    // Only on "for you" episodes.
    let season: Int?
    let episode: Int?
    let backdrop: String?
    let overview: String?
    // On a person's page: what they did on it, and in front of or behind the camera.
    let role: String?
    let `as`: String?
    /// Why it is here for you: "Because you like Tom Hardy".
    let reason: String?
    /// Its age rating, "18+" or "PG"; nil when unrated.
    let age: String?
    /// Outside your age levels, shown only because you follow or saved it.
    let ageWarn: Bool?
    /// What your friends made of it, newest first.
    let friends: [FriendMark]?

    var id: String { "\(kind)-\(tmdbId)-\(date ?? "")" }
    var isTV: Bool { kind == "tv" }
}

nonisolated struct CalendarEpisode: Codable, Hashable, Sendable, Identifiable {
    let show: String
    let tmdbId: Int?
    let season: Int
    let episode: Int
    let airs: String
    let poster: String?
    let following: Bool
    let platforms: [Platform]

    var id: String { "\(show)-\(season)-\(episode)" }
    var code: String { String(format: "S%02dE%02d", season, episode) }
}

nonisolated struct User: Codable, Hashable, Sendable {
    let id: Int
    let username: String
    let displayName: String?
    /// Server path of the profile photo (versioned), or nil for none.
    let avatar: String?

    var name: String { displayName ?? username }
}

nonisolated struct Account: Codable, Sendable {
    let username: String
    let displayName: String?
    let email: String?
    let hasPassword: Bool
    let google: Bool
    let isOwner: Bool
}

nonisolated struct AccountPayload: Codable, Sendable { let account: Account }

nonisolated struct HomePayload: Codable, Sendable {
    let today: String
    let user: User?
    let forYou: [Card]
    let calendar: [CalendarEpisode]
    let trending: [Card]
    let inStore: [Card]
    let fromPeople: [PersonNews]?
}

nonisolated struct TodayPayload: Codable, Sendable {
    let today: String
    let available: [Card]
    let upcoming: [Card]
}

nonisolated struct ResultsPayload: Codable, Sendable {
    let results: [Card]
    let people: [PersonHit]?
    /// Search pages ten at a time: the page to ask for next, nil at the end.
    let next: Int?
}

/// An actor or director as search finds them.
nonisolated struct PersonHit: Codable, Hashable, Sendable {
    let id: Int
    let name: String
    let profile: String?
    let department: String?
    let knownFor: [String]
}

/// A face in a row: cast, crew, people you follow.
nonisolated struct PersonChip: Codable, Hashable, Sendable {
    let id: Int
    let name: String
    let profile: String?
    let role: String?
    var key: String { "\(id)-\(role ?? "")" }
}

nonisolated struct PersonRef: Hashable, Identifiable, Sendable {
    let id: Int
}

nonisolated struct PersonDetail: Codable, Sendable {
    let id: Int
    let name: String
    let profile: String?
    let department: String?
    let birthday: String?
    let deathday: String?
    let place: String?
    let bio: String?
    let credits: [Card]
    var following: Bool
}

nonisolated struct FollowedPerson: Codable, Hashable, Sendable {
    let id: Int
    let name: String
    let profile: String?
    let seen: Int?
}

nonisolated struct PersonNews: Codable, Hashable, Sendable {
    let person: FollowedPerson
    let title: Card
}

nonisolated struct LibraryPayload: Codable, Sendable {
    let following: [Card]
    let watchlist: [Card]
    let people: [FollowedPerson]?
    let loved: [FollowedPerson]?
}

nonisolated struct TitleDetail: Codable, Sendable {
    let tmdbId: Int
    let kind: String
    let title: String
    let tagline: String?
    let overview: String?
    let year: Int?
    let releaseDate: String?
    let runtime: Int?
    let seasons: Int?
    let genres: [String]
    let rating: Double?
    let poster: String?
    let backdrop: String?
    let cast: [String]
    let directors: [String]
    let trailer: String?
    /// Directors first, then the cast, with faces.
    let people: [PersonChip]?
    let platforms: [Platform]
    let verdict: String?
    /// What your friends made of it.
    let friends: [FriendMark]?
    /// IMDb's rating and votes, from MOX's copy of IMDb's datasets.
    let imdb: ImdbRating?
    let following: Bool
    /// A series: how many episodes, how many are out, how many you watched.
    let progress: SeriesProgress?
    /// Its age rating, "18+" or "PG"; nil when unrated.
    let age: String?
}

nonisolated struct EpisodeProgress: Codable, Hashable, Sendable {
    let season: Int
    let episode: Int
    let name: String?
    let airs: String?
    let out: Bool
    var watched: Bool
}

nonisolated struct SeriesProgress: Codable, Hashable, Sendable {
    struct Next: Codable, Hashable, Sendable {
        let season: Int
        let episode: Int
        let airs: String?
    }

    struct SeasonInfo: Codable, Hashable, Sendable {
        let season: Int
        let name: String
        let episodes: Int
    }

    let season: Int
    let seasonName: String
    let seasonCount: Int
    let seasons: [SeasonInfo]?
    let totalEpisodes: Int
    let aired: Int
    var watched: Int
    var episodes: [EpisodeProgress]
    let next: Next?
    /// Where this season streams, when it names its own service.
    let services: [String]?
}

/// Something that can be opened in the title sheet.
nonisolated struct TitleRef: Hashable, Identifiable, Sendable {
    let tmdbId: Int
    let kind: String
    var id: String { "\(kind)-\(tmdbId)" }
}

extension Card {
    var ref: TitleRef { TitleRef(tmdbId: tmdbId, kind: kind) }
}

nonisolated struct ServiceChoice: Codable, Hashable, Sendable, Identifiable {
    let providerId: Int
    let name: String
    let logo: String?
    let selected: Bool
    var id: Int { providerId }
}

nonisolated struct ServicesPayload: Codable, Sendable {
    let services: [ServiceChoice]
}

nonisolated struct WallItem: Codable, Hashable, Sendable, Identifiable {
    let tmdbId: Int
    let kind: String
    let title: String
    let year: Int?
    let poster: String?
    var verdict: String?
    var id: String { "\(kind)-\(tmdbId)" }
    var ref: TitleRef { TitleRef(tmdbId: tmdbId, kind: kind) }
}

nonisolated struct WallPayload: Codable, Sendable {
    let items: [WallItem]
}

nonisolated struct PicksPayload: Codable, Sendable {
    let picks: [Card]
}

nonisolated struct ImdbRating: Codable, Hashable, Sendable {
    let id: String
    let rating: Double
    let votes: Int
}

// MARK: - Studios

nonisolated struct Studio: Codable, Hashable, Sendable, Identifiable {
    let slug: String
    let name: String
    let logo: String
    /// "movie", "tv" or both, the first being the one it opens on.
    let kinds: [String]
    /// Followed studios lead the list.
    let following: Bool?

    var id: String { slug }
}

nonisolated struct StudiosPayload: Codable, Sendable {
    let studios: [Studio]
}

nonisolated struct StudioPage: Codable, Sendable {
    let results: [Card]
    let next: Int?
}

// MARK: - Friends

nonisolated struct Friend: Codable, Hashable, Sendable, Identifiable {
    let id: Int
    let name: String
    let username: String
    let avatar: String?
}

/// One friend's verdict on one title.
nonisolated struct FriendMark: Codable, Hashable, Sendable {
    let id: Int
    let name: String
    let avatar: String?
    let verdict: String

    /// "loves it", "didn't like it" — after their name. Same words as the website.
    var verb: String {
        switch verdict {
        case "love": "loves it"
        case "like": "likes it"
        case "dislike": "didn't like it"
        case "watchlist": "wants to watch it"
        case "seen": "has seen it"
        default: "isn't interested"
        }
    }
}

nonisolated struct FriendsPayload: Codable, Sendable {
    let friends: [Friend]
}

nonisolated struct FindPeoplePayload: Codable, Sendable {
    let people: [Friend]
}

nonisolated struct FriendAdded: Codable, Sendable {
    let friend: Friend
    let friends: [Friend]
}

nonisolated struct FriendActivity: Codable, Hashable, Sendable, Identifiable {
    let friend: FriendMark
    let at: Int
    let title: Card

    var id: String { "\(friend.id)-\(title.kind)-\(title.tmdbId)" }
}

nonisolated struct FriendActivityPayload: Codable, Sendable {
    let friends: [Friend]?
    let items: [FriendActivity]
    let next: Int?
}
