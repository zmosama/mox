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
    let following: Bool
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
