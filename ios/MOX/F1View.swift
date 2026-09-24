import SwiftUI

// MARK: - Models

nonisolated struct F1Session: Codable, Hashable, Sendable {
    let kind: String
    let label: String
    let at: String

    var date: Date? { F1Time.parse(at) }
    var isMain: Bool { kind == "race" || kind == "quali" || kind == "sprint" }
}

nonisolated struct F1Race: Codable, Hashable, Sendable, Identifiable {
    let season: Int
    let round: Int
    let name: String
    let circuit: String
    let locality: String
    let country: String
    let sessions: [F1Session]
    let at: String
    let sprint: Bool
    let status: String
    let watched: Bool

    var id: Int { round }
}

nonisolated struct F1Result: Codable, Hashable, Sendable {
    let position: Int?
    let driver: String
    let code: String?
    let team: String
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
    let name: String
    let team: String?
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
    let locality: String
    let country: String
    let sessions: [F1Session]
    let sprint: Bool
    let status: String
    let watched: Bool
    let watch: F1Watch
    let results: F1Results?
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

private let f1Red = Color(hex: 0xE10600)

// MARK: - Tab

/// The F1 tab: the next weekend with every session in Cairo time, the latest
/// result behind the spoiler shield, the standings, and the season. The web's
/// /f1, the same order.
struct F1View: View {
    @Environment(API.self) private var api
    @Environment(\.openURL) private var openURL
    @State private var board: F1Board?
    @State private var loadError: String?
    @State private var table = "drivers"
    @State private var round: F1Race?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .firstTextBaseline) {
                    Text("F1").font(.sora(28, .bold, relativeTo: .title)).foregroundStyle(Theme.paper)
                    Spacer()
                    if let board {
                        Text("\(String(board.season)) season").font(.sora(13)).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                if let board {
                    content(board)
                } else if let loadError {
                    Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .refreshable { await load() }
        .task(id: api.revision) { await load() }
        .sheet(item: $round) { race in
            F1RoundSheet(race: race) { Task { await load() } }
        }
    }

    @ViewBuilder
    private func content(_ b: F1Board) -> some View {
        if let next = b.next {
            NextRaceCard(race: next, watch: b.watch) { if let url = URL(string: b.watch.url) { openURL(url) } }
                .padding(.horizontal, 20)
        }

        if let latest = b.latest {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Latest result", detail: latest.name)
                Group {
                    if let results = latest.results {
                        F1ResultsTable(results: results)
                    } else {
                        ShieldCard(signedIn: api.user != nil) { await reveal(b.season, latest.round) }
                    }
                }
                .padding(.horizontal, 20)
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Standings")
            Picker("Standings", selection: $table) {
                Text("Drivers").tag("drivers")
                Text("Teams").tag("teams")
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            if let standings = b.standings {
                if let latest = b.latest, standings.afterRound < latest.round {
                    Text("As they stood after round \(standings.afterRound) — the rounds since are still hidden.")
                        .font(.sora(12.5)).foregroundStyle(Theme.faint).padding(.horizontal, 20)
                }
                VStack(spacing: 0) {
                    ForEach(table == "drivers" ? standings.drivers : standings.teams, id: \.name) { s in
                        F1Row(position: s.position, name: s.name, team: s.team, trailing: Self.points(s.points), bold: true)
                    }
                }
                .background(Theme.surface, in: .rect(cornerRadius: 18))
                .padding(.horizontal, 20)
            } else {
                Text("Hidden until you've watched a race — the standings give the results away.")
                    .font(.sora(13.5)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Season")
            VStack(spacing: 0) {
                ForEach(b.races) { race in
                    Button { round = race } label: { SeasonRow(race: race) }
                        .buttonStyle(.plain)
                }
            }
            .background(Theme.surface, in: .rect(cornerRadius: 18))
            .padding(.horizontal, 20)
        }
    }

    static func points(_ p: Double) -> String {
        p == p.rounded() ? String(Int(p)) : String(format: "%.1f", p)
    }

    private func reveal(_ season: Int, _ round: Int) async {
        try? await api.setF1Watched(season: season, round: round, true)
        await load()
    }

    private func load() async {
        do {
            board = try await api.f1()
            loadError = nil
        } catch {
            if board == nil { loadError = "The F1 calendar can't be reached right now." }
        }
    }
}

// MARK: - Pieces

private struct NextRaceCard: View {
    let race: F1Race
    let watch: F1Watch
    let openWatch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("ROUND \(race.round) · \(race.sprint ? "SPRINT WEEKEND" : "RACE WEEKEND")")
                    .font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                Text(race.name).font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
                Text("\(race.circuit) · \(race.locality), \(race.country)")
                    .font(.sora(13)).foregroundStyle(Theme.muted)
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    HStack(spacing: 10) {
                        if let live = race.sessions.first(where: {
                            guard let d = $0.date else { return false }
                            return d <= context.date && context.date < d.addingTimeInterval(2 * 3600)
                        }) {
                            Text("● \(live.label) is live")
                                .font(.sora(13, .semibold))
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(f1Red, in: .capsule)
                        } else if let next = race.sessions.first(where: { ($0.date ?? .distantPast) > context.date }),
                                  let d = next.date {
                            Text("\(next.label) in \(F1Time.until(d, from: context.date))")
                                .font(.sora(13, .medium))
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(.white.opacity(0.08), in: .capsule)
                        }
                        Button(action: openWatch) {
                            Text("Watch on \(watch.name)")
                                .font(.sora(13, .semibold))
                                .padding(.horizontal, 14).frame(height: 32)
                                .background(Theme.green, in: .capsule)
                                .foregroundStyle(Theme.ink)
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(Theme.paper)
                    .padding(.top, 12)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)

            SessionList(sessions: race.sessions)
        }
        .background {
            ZStack {
                Theme.surface
                LinearGradient(colors: [f1Red.opacity(0.28), .clear], startPoint: .topLeading, endPoint: UnitPoint(x: 0.7, y: 0.4))
            }
        }
        .clipShape(.rect(cornerRadius: 22))
    }
}

private struct SessionList: View {
    let sessions: [F1Session]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(sessions, id: \.kind) { s in
                let past = (s.date?.addingTimeInterval(2 * 3600) ?? .distantFuture) < .now
                HStack {
                    Text(s.label)
                        .font(.sora(14, s.isMain ? .semibold : .regular))
                        .foregroundStyle(s.isMain ? Theme.paper : Theme.muted)
                    Spacer()
                    Text(s.date.map(F1Time.dayTime) ?? "")
                        .font(.sora(13.5).monospacedDigit())
                        .foregroundStyle(Theme.paper)
                }
                .padding(.horizontal, 18)
                .frame(height: 44)
                .opacity(past ? 0.45 : 1)
                if s.kind != sessions.last?.kind {
                    Divider().overlay(.white.opacity(0.06))
                }
            }
        }
    }
}

private struct ShieldCard: View {
    let signedIn: Bool
    let reveal: () async -> Void
    @State private var working = false

    var body: some View {
        VStack(spacing: 10) {
            Text("Results hidden").font(.sora(15, .semibold)).foregroundStyle(Theme.paper)
            Text("So nothing spoils it if you're watching it later. The standings wait too.")
                .font(.sora(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            if signedIn {
                Button {
                    working = true
                    Task { await reveal(); working = false }
                } label: {
                    Text(working ? "Showing…" : "I've watched it — show results")
                        .font(.sora(14, .semibold))
                        .padding(.horizontal, 18).frame(height: 40)
                        .background(Theme.green, in: .capsule)
                        .foregroundStyle(Theme.ink)
                }
                .buttonStyle(.plain)
                .disabled(working)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26).padding(.horizontal, 20)
        .background(Theme.surface, in: .rect(cornerRadius: 18))
    }
}

struct F1ResultsTable: View {
    let results: F1Results
    @State private var tab = "race"

    private var tabs: [(String, String)] {
        [("race", "Race"), ("sprint", "Sprint"), ("quali", "Qualifying")].filter { !rows($0.0).isEmpty }
    }

    private func rows(_ key: String) -> [F1Result] {
        switch key {
        case "sprint": results.sprint
        case "quali": results.quali
        default: results.race
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if tabs.isEmpty {
                Text("Results aren't in yet.").font(.sora(13.5)).foregroundStyle(Theme.muted).padding(20)
            } else {
                if tabs.count > 1 {
                    Picker("Session", selection: $tab) {
                        ForEach(tabs, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(12)
                }
                let current = tabs.contains(where: { $0.0 == tab }) ? tab : tabs[0].0
                ForEach(rows(current), id: \.driver) { r in
                    F1Row(position: r.position, name: r.driver, team: r.team, trailing: r.detail, podium: (r.position ?? 99) <= 3)
                }
            }
        }
        .background(Theme.surface, in: .rect(cornerRadius: 18))
    }
}

private struct F1Row: View {
    let position: Int?
    let name: String
    let team: String?
    let trailing: String
    var bold = false
    var podium = false

    var body: some View {
        HStack(spacing: 12) {
            Text(position.map(String.init) ?? "–")
                .font(.sora(13, podium ? .bold : .regular).monospacedDigit())
                .foregroundStyle(podium ? Theme.green : Theme.faint)
                .frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(.sora(14, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                if let team { Text(team).font(.sora(11.5)).foregroundStyle(Theme.faint).lineLimit(1) }
            }
            Spacer(minLength: 8)
            Text(trailing)
                .font(.sora(bold ? 14 : 12.5, bold ? .semibold : .regular).monospacedDigit())
                .foregroundStyle(bold ? Theme.paper : Theme.muted)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
    }
}

private struct SeasonRow: View {
    let race: F1Race

    var body: some View {
        HStack(spacing: 12) {
            Text("\(race.round)").font(.sora(13).monospacedDigit()).foregroundStyle(Theme.faint).frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(race.name).font(.sora(14.5, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                Text(dates + (race.sprint ? " · Sprint" : "")).font(.sora(12)).foregroundStyle(Theme.faint)
            }
            Spacer()
            badge
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(.rect)
    }

    private var dates: String {
        guard let first = race.sessions.first?.date, let last = F1Time.parse(race.at) else { return "" }
        return "\(F1Time.dayMonth(first)) – \(F1Time.dayMonth(last))"
    }

    @ViewBuilder
    private var badge: some View {
        switch race.status {
        case "live":
            Text("Live").font(.sora(11, .semibold)).padding(.horizontal, 8).padding(.vertical, 3).background(f1Red, in: .capsule)
        case "next":
            Text("Next").font(.sora(11, .semibold)).foregroundStyle(Theme.green)
                .padding(.horizontal, 8).padding(.vertical, 3).background(Theme.green.opacity(0.2), in: .capsule)
        case "done":
            Text(race.watched ? "✓ Watched" : "Done").font(.sora(11.5, .medium))
                .foregroundStyle(race.watched ? Theme.green : Theme.faint)
        default:
            EmptyView()
        }
    }
}

/// One round: its sessions in Cairo time, and its results once they may be shown.
private struct F1RoundSheet: View {
    let race: F1Race
    let changed: () -> Void
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var detail: F1RoundDetail?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ROUND \(race.round)").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                    Text(race.name).font(.sora(24, .bold)).foregroundStyle(Theme.paper)
                    Text("\(race.circuit) · \(race.locality), \(race.country)").font(.sora(13)).foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 20)
                .padding(.top, 36)

                SessionList(sessions: race.sessions)
                    .background(Theme.surface, in: .rect(cornerRadius: 18))
                    .padding(.horizontal, 20)

                if race.status == "done" {
                    Group {
                        if let results = detail?.results {
                            F1ResultsTable(results: results)
                        } else if detail != nil {
                            ShieldCard(signedIn: api.user != nil) {
                                try? await api.setF1Watched(season: race.season, round: race.round, true)
                                await load()
                                changed()
                            }
                        } else {
                            ProgressView().frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.bottom, 40)
        }
        .background(Theme.ink)
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.paper)
                    .glassCircle(36)
            }
            .buttonStyle(.plain)
            .padding(16)
            .accessibilityLabel("Close")
        }
        .presentationDragIndicator(.visible)
        .task { await load() }
    }

    private func load() async {
        detail = try? await api.f1Round(race.round)
    }
}
