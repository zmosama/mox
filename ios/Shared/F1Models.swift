import Foundation

// Formula 1 as the server sends it (src/lib/f1.ts), for the phone and the television.

nonisolated struct F1Session: Codable, Hashable, Sendable {
    let kind: String
    let label: String
    let at: String

    var date: Date? { F1Time.parse(at) }
    var isMain: Bool { kind == "race" || kind == "quali" || kind == "sprint" }
}

/// A circuit's outline in a box at most 1000 across, start/finish first.
nonisolated struct F1Track: Codable, Hashable, Sendable {
    let w: Double
    let h: Double
    let points: [[Double]]
    let length: Int
    let firstGp: Int
}

nonisolated struct F1Race: Codable, Hashable, Sendable, Identifiable {
    let season: Int
    let round: Int
    let name: String
    let circuit: String
    let track: F1Track?
    let locality: String
    let country: String
    let sessions: [F1Session]
    let at: String
    let sprint: Bool
    let status: String
    let watched: Bool
    /// The top three, once finished and not behind the shield.
    let podium: [F1Result]?

    var id: Int { round }
}

nonisolated struct F1Result: Codable, Hashable, Sendable {
    let position: Int?
    let driver: String
    let driverId: String
    let teamId: String
    let code: String?
    let number: String?
    /// Where they started: nil in qualifying, 0 from the pit lane.
    let grid: Int?
    let fastest: Bool
    let photo: String?
    let team: String
    let color: String
    let detail: String
    let points: Double
}

nonisolated struct F1Results: Codable, Hashable, Sendable {
    let race: [F1Result]
    let sprint: [F1Result]
    let quali: [F1Result]
}

nonisolated struct F1Standing: Codable, Hashable, Sendable {
    let position: Int
    let id: String
    let code: String?
    let photo: String?
    let name: String
    let team: String?
    let color: String
    let points: Double
    let wins: Int
}

nonisolated struct F1Watch: Codable, Hashable, Sendable {
    let name: String
    let url: String
}

nonisolated struct F1Board: Codable, Sendable {
    struct Latest: Codable, Sendable {
        let round: Int
        let name: String
        let results: F1Results?
    }

    struct Standings: Codable, Sendable {
        let afterRound: Int
        let drivers: [F1Standing]
        let teams: [F1Standing]
    }

    let season: Int
    let watch: F1Watch
    let shield: Bool
    let next: F1Race?
    let races: [F1Race]
    let latest: Latest?
    let standings: Standings?
}

nonisolated struct F1RoundDetail: Codable, Sendable {
    let season: Int
    let round: Int
    let name: String
    let circuit: String
    let track: F1Track?
    let locality: String
    let country: String
    let sessions: [F1Session]
    let sprint: Bool
    let status: String
    let watched: Bool
    let watch: F1Watch
    let results: F1Results?
}

/// One round of the season from a driver's or a team's side.
nonisolated struct F1SeasonEntry: Codable, Hashable, Sendable {
    let round: Int
    let name: String
    let position: Int?
    let grid: Int?
    let points: Double
    let detail: String
    let driver: String
}

nonisolated struct F1SeasonLine: Codable, Sendable {
    let year: Int
    let position: Int?
    let points: Double?
    let wins: Int?
    let rounds: [F1SeasonEntry]
}

nonisolated struct F1Driver: Codable, Sendable {
    struct Career: Codable, Sendable {
        let starts: Int?
        let wins: Int?
        let podiums: Int?
        let poles: Int?
        let titles: Int?
    }

    let id: String
    let name: String
    let code: String?
    let number: String?
    let nationality: String?
    let born: String?
    let team: String?
    let teamId: String?
    let color: String
    let photo: String?
    let bio: String?
    let wiki: String?
    let career: Career
    let season: F1SeasonLine
}

nonisolated struct F1Team: Codable, Sendable {
    struct Career: Codable, Sendable {
        let starts: Int?
        let wins: Int?
        let titles: Int?
    }

    struct Seat: Codable, Sendable, Hashable {
        /// Raced for them in the last round; the rest stood in earlier.
        let current: Bool?
        /// Head to waist, for the team's header.
        let portrait: String?
        let id: String
        let name: String
        let code: String?
        let number: String?
        let photo: String?
    }

    let id: String
    let name: String
    let nationality: String?
    let color: String
    /// The white logo, and the 2026 car side-on.
    let photo: String?
    let car: String?
    let bio: String?
    let wiki: String?
    let drivers: [Seat]
    let career: Career
    let season: F1SeasonLine
}

/// Session times, read from UTC and shown in Cairo, as everywhere else in MOX.
nonisolated enum F1Time {
    static func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }

    static func dayTime(_ d: Date) -> String { format(d, "EEE HH:mm") }
    static func dayMonth(_ d: Date) -> String { format(d, "d MMM") }

    private static func format(_ d: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.timeZone = TimeZone(identifier: "Africa/Cairo")
        f.dateFormat = pattern
        return f.string(from: d)
    }

    /// "2d 4h", "3h 20m", "12m".
    static func until(_ d: Date, from now: Date) -> String {
        let mins = max(0, Int(d.timeIntervalSince(now) / 60))
        let days = mins / 1440, hours = (mins % 1440) / 60, rest = mins % 60
        return days > 0 ? "\(days)d \(hours)h" : hours > 0 ? "\(hours)h \(rest)m" : "\(rest)m"
    }
}
