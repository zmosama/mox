import Foundation
import Observation
import Security

/// Preferences, kept in UserDefaults. The AI key is the exception: it lives in
/// the Keychain, because it is a credential.
@Observable
final class AppSettings {
    /// Where shared links point: the live site, for anyone to open.
    static let publicSite = URL(string: "https://mox.mosama.me")!

    #if DEBUG
    static let defaultServer = "http://localhost:3000"
    #else
    static let defaultServer = "https://mox.mosama.me"
    #endif

    var server: String { didSet { save("server", server) } }
    /// Today's events from the phone's calendar, at the top of Today.
    var showCalendarInToday: Bool { didSet { save("showCalendarInToday", showCalendarInToday) } }
    var aiProvider: String { didSet { save("aiProvider", aiProvider) } }
    /// Episodes of shows you follow, on the morning they reach you.
    var notifyEpisodes: Bool { didSet { save("notifyEpisodes", notifyEpisodes) } }
    /// A watchlist title reaching one of your services.
    var notifyWatchlist: Bool { didSet { save("notifyWatchlist", notifyWatchlist) } }
    /// When episode notifications go off, in minutes after midnight, Cairo
    /// time. Ten o'clock is when the global streamers' midnight Pacific lands.
    var notifyAt: Int { didSet { save("notifyAt", notifyAt) } }
    /// Qualifying, sprint and race, a little before they start.
    var notifyF1: Bool { didSet { save("notifyF1", notifyF1) } }
    /// How many minutes before a session its notification goes off.
    var f1Lead: Int { didSet { save("f1Lead", f1Lead) } }
    /// The account's tabs, kept here too so the bar is right before the
    /// server has answered. The server's copy wins whenever it arrives.
    var tabs: [TabID] { didSet { save("tabs", tabs.map(\.rawValue)) } }

    var aiKey: String {
        get { Keychain.read("ai-key") ?? "" }
        set { Keychain.write("ai-key", newValue); aiKeyRevision += 1 }
    }
    /// Keychain reads are not observed; this is, so views notice a new key.
    private(set) var aiKeyRevision = 0
    var hasAIKey: Bool { _ = aiKeyRevision; return !aiKey.isEmpty }

    private let defaults = UserDefaults.standard

    init() {
        server = defaults.string(forKey: "server") ?? Self.defaultServer
        showCalendarInToday = defaults.bool(forKey: "showCalendarInToday")
        aiProvider = defaults.string(forKey: "aiProvider") ?? "Anthropic"
        notifyEpisodes = defaults.bool(forKey: "notifyEpisodes")
        notifyWatchlist = defaults.bool(forKey: "notifyWatchlist")
        notifyAt = defaults.object(forKey: "notifyAt") as? Int ?? 10 * 60
        notifyF1 = defaults.bool(forKey: "notifyF1")
        f1Lead = defaults.object(forKey: "f1Lead") as? Int ?? 15
        tabs = (defaults.stringArray(forKey: "tabs") ?? []).compactMap(TabID.init(rawValue:))
        if tabs.isEmpty { tabs = TabID.defaults }
    }

    private func save(_ key: String, _ value: Any) { defaults.set(value, forKey: key) }
}

enum Keychain {
    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "me.mosama.mox",
         kSecAttrAccount as String: account]
    }

    static func read(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ account: String, _ value: String) {
        SecItemDelete(query(account) as CFDictionary)
        guard !value.isEmpty else { return }
        var q = query(account)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }
}
