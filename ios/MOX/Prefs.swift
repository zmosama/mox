import Foundation

/// A tab the glass bar can hold, besides the ring, which is always in the middle.
/// The same list as src/lib/prefs.ts on the server; the account's choice and
/// order are stored there, so the website and the app agree.
enum TabID: String, CaseIterable, Codable, Sendable, Identifiable {
    case today, news, library, f1, calendar, tasks

    var id: String { rawValue }

    var label: String {
        switch self {
        case .today: "Today"
        case .news: "News"
        case .library: "My List"
        case .f1: "F1"
        case .calendar: "Calendar"
        case .tasks: "Tasks"
        }
    }

    var icon: String {
        switch self {
        case .today: "sparkles.tv"
        case .news: "newspaper"
        case .library: "bookmark"
        case .f1: "flag.checkered"
        case .calendar: "calendar"
        case .tasks: "checklist"
        }
    }

    /// Reads the phone's own calendar or reminders, so it needs iOS's permission first.
    var needsDevice: Bool { self == .calendar || self == .tasks }

    /// Two either side of the ring: more than five and iOS folds the rest into "More".
    static let slots = 4
    static let defaults: [TabID] = [.today, .news, .library, .f1]
}

nonisolated struct Prefs: Codable, Sendable, Equatable {
    var tabs: [String]
    var newsLangs: [String]
    var f1Shield: Bool
    /// Age levels to show: "all", "7", "pg", "13", "18". All five means no filter.
    var ages: [String]?
    /// Also hide titles with no rating at all.
    var hideUnrated: Bool?

    /// Known tabs only, in order — a tab added by a newer server is skipped
    /// rather than drawn as a button to nowhere.
    var tabIDs: [TabID] { tabs.compactMap(TabID.init(rawValue:)) }
}

nonisolated struct PrefsPayload: Codable, Sendable {
    let prefs: Prefs
}

/// The five age levels, the same as src/lib/ratings.ts.
enum AgeLevel: String, CaseIterable, Identifiable {
    case all, seven = "7", pg, thirteen = "13", eighteen = "18"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All ages"
        case .seven: "7+"
        case .pg: "PG"
        case .thirteen: "13+"
        case .eighteen: "18+"
        }
    }

    var hint: String {
        switch self {
        case .all: "G · TV-Y · TV-G"
        case .seven: "TV-Y7"
        case .pg: "PG · TV-PG"
        case .thirteen: "PG-13 · TV-14"
        case .eighteen: "R · NC-17 · TV-MA"
        }
    }
}
