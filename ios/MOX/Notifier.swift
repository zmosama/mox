import BackgroundTasks
import Foundation
import Observation
import UIKit
import UserNotifications

/// What /api/app/alerts answers: the fortnight's episodes of shows you follow,
/// and where each title on your watchlist streams right now.
nonisolated struct AlertsPayload: Codable, Sendable {
    struct Episode: Codable, Sendable {
        let tmdbId: Int
        let show: String
        let season: Int
        let episode: Int
        let airs: String
        let platforms: [String]
    }

    struct Wanted: Codable, Sendable {
        let tmdbId: Int
        let kind: String
        let title: String
        let platforms: [String]
    }

    let user: Int
    let episodes: [Episode]
    let watchlist: [Wanted]
    /// The services this account picked, so a new subscription is not
    /// mistaken for a title arriving.
    let services: String
}

/// Notifications made on the phone itself: nothing is pushed from the server.
///
/// Episodes are known in advance, so each is scheduled for the morning it
/// reaches you. A watchlist title arriving is not, so the phone compares where
/// each one streams against what it saw last time and speaks up when one moves
/// from nowhere to one of your services. Both refresh whenever the app opens
/// and when iOS gives it a moment in the background.
///
/// Push from the server can replace the background part later without
/// changing any of this: it would only need to wake the same `refresh`.
@Observable
final class Notifier {
    static let refreshTask = "me.mosama.mox.alerts"

    private(set) var status: UNAuthorizationStatus = .notDetermined
    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private var lastRun: Date?

    /// iOS keeps at most 64 pending notifications per app.
    private let cap = 48

    func checkStatus() async {
        status = await center.notificationSettings().authorizationStatus
    }

    /// Asks once; after a refusal only iOS Settings can turn them back on.
    func requestPermission() async -> Bool {
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        await checkStatus()
        return granted
    }

    /// Brings the scheduled episodes and the watchlist memory up to date.
    /// Opening the app calls this often; `force` skips the quarter-hour wait.
    func refresh(api: API, settings: AppSettings, force: Bool = false) async {
        if !force, let lastRun, Date.now.timeIntervalSince(lastRun) < 15 * 60 { return }
        await checkStatus()
        guard status == .authorized || status == .provisional,
              settings.notifyEpisodes || settings.notifyWatchlist else {
            await clearEpisodes()
            return
        }
        guard let payload = try? await api.alerts() else { return }
        lastRun = .now

        if settings.notifyEpisodes {
            await schedule(payload.episodes, at: settings.notifyAt)
        } else {
            await clearEpisodes()
        }
        if settings.notifyWatchlist {
            await announceArrivals(payload)
        } else {
            // Forgotten while off, so turning it back on starts from the
            // present instead of announcing everything that arrived meanwhile.
            defaults.removeObject(forKey: memoryKey(payload.user))
        }
    }

    /// Signing out: nothing about that account should still go off.
    func clearAll() {
        center.removeAllPendingNotificationRequests()
        lastRun = nil
    }

    func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTask)
        request.earliestBeginDate = .now.addingTimeInterval(4 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }

    // MARK: - Episodes

    private func clearEpisodes() async {
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("episode:") }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    /// One notification per show per day, at the time chosen in Settings, in
    /// Cairo time like every date the server sends. A season dropped all at
    /// once is one thing to go and watch, not eight.
    private func schedule(_ episodes: [AlertsPayload.Episode], at minutes: Int) async {
        await clearEpisodes()

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = Day.zone
        var batches: [(key: String, at: Date, episodes: [AlertsPayload.Episode])] = []
        for e in episodes {
            guard let day = Day.date(e.airs),
                  let at = cal.date(byAdding: .minute, value: minutes, to: cal.startOfDay(for: day)),
                  at > .now else { continue }
            let key = "\(e.tmdbId):\(e.airs)"
            if let i = batches.firstIndex(where: { $0.key == key }) {
                batches[i].episodes.append(e)
            } else {
                batches.append((key, at, [e]))
            }
        }

        for batch in batches.sorted(by: { $0.at < $1.at }).prefix(cap) {
            let first = batch.episodes[0]
            let content = UNMutableNotificationContent()
            content.title = first.show
            content.body = Self.episodeLine(batch.episodes)
            content.sound = .default
            content.threadIdentifier = "episodes"
            content.userInfo = ["kind": "tv", "id": first.tmdbId]
            let when = cal.dateComponents([.timeZone, .year, .month, .day, .hour, .minute], from: batch.at)
            let request = UNNotificationRequest(
                identifier: "episode:\(batch.key)",
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
            )
            try? await center.add(request)
        }
    }

    /// "S2 E3 is out — watch it on Netflix", or "S2 E1–E8 are out" for a drop.
    static func episodeLine(_ episodes: [AlertsPayload.Episode]) -> String {
        let first = episodes[0]
        let what: String
        if episodes.count == 1 {
            what = "S\(first.season) E\(first.episode) is out"
        } else {
            let last = episodes[episodes.count - 1]
            what = last.season == first.season
                ? "S\(first.season) E\(first.episode)–E\(last.episode) are out"
                : "\(episodes.count) new episodes are out"
        }
        return first.platforms.first.map { "\(what) — watch it on \($0)" } ?? "\(what) today"
    }

    // MARK: - Watchlist

    private func memoryKey(_ user: Int) -> String { "alerts.watchlist.\(user)" }

    /// Tells you about a watchlist title that was streaming nowhere you pay for
    /// last time and is now. A title added while already streaming is not news,
    /// and nor is anything the first time this runs, or after you change your
    /// services: those only set what "last time" means.
    private func announceArrivals(_ payload: AlertsPayload) async {
        let key = memoryKey(payload.user)
        let now = Dictionary(
            payload.watchlist.map { ("\($0.kind):\($0.tmdbId)", !$0.platforms.isEmpty) },
            uniquingKeysWith: { a, _ in a }
        )
        let before = defaults.dictionary(forKey: key) as? [String: Bool]
        let sameServices = defaults.string(forKey: key + ".services") == payload.services
        defaults.set(now, forKey: key)
        defaults.set(payload.services, forKey: key + ".services")
        guard let before, sameServices else { return }

        for title in payload.watchlist where !title.platforms.isEmpty {
            guard before["\(title.kind):\(title.tmdbId)"] == false else { continue }
            let content = UNMutableNotificationContent()
            content.title = title.title
            content.body = "Now on \(ListFormatter.localizedString(byJoining: title.platforms)) — it's on your watchlist."
            content.sound = .default
            content.threadIdentifier = "watchlist"
            content.userInfo = ["kind": title.kind, "id": title.tmdbId]
            let request = UNNotificationRequest(
                identifier: "arrival:\(title.kind):\(title.tmdbId)",
                content: content,
                trigger: nil
            )
            try? await center.add(request)
        }
    }
}

/// Shows notifications while the app is open too, and opens the title one is
/// about when it is tapped — including when the tap is what launched the app,
/// which is why it is installed before the first screen exists.
final class NotificationOpener: NSObject, UNUserNotificationCenterDelegate {
    var open: ((TitleRef) -> Void)?

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let kind = info["kind"] as? String, let id = info["id"] as? Int else { return }
        await MainActor.run { open?(TitleRef(tmdbId: id, kind: kind)) }
    }
}
