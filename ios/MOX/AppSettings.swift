import Foundation
import Observation
import Security

/// Preferences, kept in UserDefaults. The AI key is the exception: it lives in
/// the Keychain, because it is a credential.
@Observable
final class AppSettings {
    #if DEBUG
    static let defaultServer = "http://localhost:3000"
    #else
    static let defaultServer = "https://mox.mosama.me"
    #endif

    var server: String { didSet { save("server", server) } }
    /// Today's events from the phone's calendar, at the top of Today.
    var showCalendarInToday: Bool { didSet { save("showCalendarInToday", showCalendarInToday) } }
    var calendarTab: Bool { didSet { save("calendarTab", calendarTab) } }
    var tasksTab: Bool { didSet { save("tasksTab", tasksTab) } }
    var aiProvider: String { didSet { save("aiProvider", aiProvider) } }

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
        calendarTab = defaults.bool(forKey: "calendarTab")
        tasksTab = defaults.bool(forKey: "tasksTab")
        aiProvider = defaults.string(forKey: "aiProvider") ?? "Anthropic"
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
