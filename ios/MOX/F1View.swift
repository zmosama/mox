import SwiftUI

// MARK: - Models

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

private let f1Red = Color(hex: 0xE10600)
private let fastestPurple = Color(hex: 0xB138DD)

extension Color {
    /// "#27F4D2" → the colour; anything unreadable is a neutral grey.
    init(f1Hex s: String) {
        self.init(hex: UInt32(s.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x8A8F98)
    }
}

/// A flag for a country or a nationality, from the names Jolpica uses.
private func flag(_ name: String?) -> String {
    let codes: [String: String] = [
        "Australia": "AU", "Australian": "AU", "China": "CN", "Chinese": "CN", "Japan": "JP", "Japanese": "JP",
        "USA": "US", "United States": "US", "American": "US", "Canada": "CA", "Canadian": "CA",
        "Monaco": "MC", "Monegasque": "MC", "Spain": "ES", "Spanish": "ES", "Austria": "AT", "Austrian": "AT",
        "UK": "GB", "British": "GB", "Belgium": "BE", "Belgian": "BE", "Hungary": "HU", "Hungarian": "HU",
        "Netherlands": "NL", "Dutch": "NL", "Italy": "IT", "Italian": "IT", "Azerbaijan": "AZ",
        "Singapore": "SG", "Malaysia": "MY", "Mexico": "MX", "Mexican": "MX", "Brazil": "BR", "Brazilian": "BR",
        "Qatar": "QA", "UAE": "AE", "United Arab Emirates": "AE", "Bahrain": "BH", "Saudi Arabia": "SA",
        "German": "DE", "Germany": "DE", "French": "FR", "France": "FR", "Finnish": "FI", "Thai": "TH",
        "Danish": "DK", "New Zealander": "NZ", "Argentine": "AR", "Argentinian": "AR", "Swiss": "CH",
        "Portugal": "PT", "Turkey": "TR", "Russia": "RU", "Chinese Taipei": "TW", "Polish": "PL",
    ]
    guard let name, let code = codes[name] else { return "" }
    return code.unicodeScalars.compactMap { UnicodeScalar(127397 + $0.value) }.map(String.init).joined()
}

private func points(_ p: Double) -> String {
    p == p.rounded() ? String(Int(p)) : String(format: "%.1f", p)
}

// MARK: - Opening things

/// Where a tap in F1 leads: a round, a driver, a team.
enum F1Link: Hashable, Identifiable {
    case round(F1Race)
    case driver(String)
    case team(String)

    var id: String {
        switch self {
        case .round(let r): "r\(r.round)"
        case .driver(let id): "d\(id)"
        case .team(let id): "t\(id)"
        }
    }
}

extension EnvironmentValues {
    /// Opens an F1 page: as a sheet from the tab, pushed inside a sheet.
    @Entry var f1Open: (F1Link) -> Void = { _ in }
}

// MARK: - Tab

/// The F1 tab: the next weekend over its track, the latest podium behind the
/// spoiler shield, the standings with faces, and the season as a wall of
/// circuits — each finished one with its top three. Drivers and teams open
/// their own pages.
struct F1View: View {
    @Environment(API.self) private var api
    @Environment(\.openURL) private var openURL
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var wide: Bool { sizeClass == .regular }
    @State private var board: F1Board?
    @State private var loadError: String?
    @State private var table = "drivers"
    @State private var open: F1Link?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
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
        .refreshable { api.touch(); await load() }
        .task(id: api.revision) { await load() }
        .environment(\.f1Open) { open = $0 }
        .sheet(item: $open) { link in
            F1Sheet(root: link) { Task { await load() } }
        }
    }

    @ViewBuilder
    private func content(_ b: F1Board) -> some View {
        if let next = b.next {
            NextRaceCard(race: next, watch: b.watch, wide: wide) { if let url = URL(string: b.watch.url) { openURL(url) } }
                .padding(.horizontal, 20)
                .onTapGesture { open = .round(next) }
        }

        if let latest = b.latest {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "Latest result", detail: latest.name)
                Group {
                    if let results = latest.results, !results.race.isEmpty || !results.sprint.isEmpty {
                        // On an iPad the podium stands beside the full result.
                        let layout = wide ? AnyLayout(HStackLayout(alignment: .top, spacing: 20)) : AnyLayout(VStackLayout(spacing: 14))
                        layout {
                            if !results.race.isEmpty { Podium(rows: results.race).frame(maxWidth: wide ? 440 : .infinity) }
                            ResultsBoard(results: results)
                        }
                    } else if latest.results != nil {
                        Text("Results aren't in yet.").font(.sora(13.5)).foregroundStyle(Theme.muted)
                    } else {
                        ShieldCard(signedIn: api.user != nil) { await reveal(b.season, latest.round) }
                    }
                }
                .padding(.horizontal, 20)
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Standings", detail: b.standings.map { "after round \($0.afterRound)" })
            if !wide {
                Picker("Standings", selection: $table) {
                    Text("Drivers").tag("drivers")
                    Text("Teams").tag("teams")
                }
                .pickerStyle(.segmented)
                .pickerWidth()
                .padding(.horizontal, 20)
            }
            if let standings = b.standings {
                if let latest = b.latest, standings.afterRound < latest.round {
                    Text("As they stood after round \(standings.afterRound) — the rounds since are still hidden.")
                        .font(.sora(12.5)).foregroundStyle(Theme.faint).padding(.horizontal, 20)
                }
                if wide {
                    // Room for both at once on an iPad.
                    HStack(alignment: .top, spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("DRIVERS").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                            StandingsList(rows: standings.drivers, teams: false)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text("TEAMS").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                            StandingsList(rows: standings.teams, teams: true)
                        }
                    }
                    .padding(.horizontal, 20)
                } else {
                    StandingsList(rows: table == "drivers" ? standings.drivers : standings.teams, teams: table == "teams")
                        .padding(.horizontal, 20)
                }
            } else {
                Text("Hidden until you've watched a race — the standings give the results away.")
                    .font(.sora(13.5)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Season", detail: "\(b.races.filter { $0.status == "done" }.count) of \(b.races.count) done")
            // The shield covers every round not marked watched; past ones are
            // rarely still to be watched, so they can all be shown at once.
            let hidden = b.races.filter { $0.status == "done" && !$0.watched && $0.podium == nil }
            if b.shield, hidden.count > 1, api.user != nil {
                Button {
                    Task {
                        for race in hidden { try? await api.setF1Watched(season: race.season, round: race.round, true) }
                        api.touch()
                        await load()
                    }
                } label: {
                    Label("Show all \(hidden.count) hidden results", systemImage: "eye")
                        .font(.sora(13, .semibold))
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(.white.opacity(0.08), in: .capsule)
                        .foregroundStyle(Theme.paper)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 158), spacing: 12)], spacing: 12) {
                ForEach(b.races) { race in
                    Button { open = .round(race) } label: { RaceTile(race: race) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func reveal(_ season: Int, _ round: Int) async {
        try? await api.setF1Watched(season: season, round: round, true)
        api.touch()
        await load()
    }

    private func load() async {
        if board == nil { board = api.peek("/api/f1") }
        do {
            board = try await api.f1()
            loadError = nil
        } catch {
            if board == nil { loadError = "The F1 calendar can't be reached right now." }
        }
    }
}

// MARK: - Track

/// A circuit's outline fitted into the space it is given, proportions kept.
nonisolated struct TrackShape: Shape {
    let track: F1Track

    func fit(_ rect: CGRect) -> (scale: CGFloat, x: CGFloat, y: CGFloat) {
        let w = max(track.w, 1), h = max(track.h, 1)
        let scale = min(rect.width / w, rect.height / h)
        return (scale, rect.minX + (rect.width - w * scale) / 2, rect.minY + (rect.height - h * scale) / 2)
    }

    func point(_ i: Int, in rect: CGRect) -> CGPoint {
        let f = fit(rect)
        let p = track.points[i]
        return CGPoint(x: f.x + p[0] * f.scale, y: f.y + p[1] * f.scale)
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for i in track.points.indices where track.points[i].count == 2 {
            let q = point(i, in: rect)
            if i == 0 { path.move(to: q) } else { path.addLine(to: q) }
        }
        path.closeSubpath()
        return path
    }
}

/// The track drawn as a lit line: a soft wide stroke under a crisp one, and
/// the start/finish marked. No blur — the glow is just a second stroke.
struct TrackMap: View {
    let track: F1Track
    var color: Color = f1Red
    var line: CGFloat = 3
    /// Draw the lap in once, on first appearance.
    var draws = false
    @State private var drawn: CGFloat = 1

    var body: some View {
        let shape = TrackShape(track: track)
        GeometryReader { geo in
            let rect = CGRect(origin: .zero, size: geo.size)
            ZStack {
                shape.stroke(color.opacity(0.22), style: StrokeStyle(lineWidth: line * 3.4, lineCap: .round, lineJoin: .round))
                shape.trim(from: 0, to: drawn)
                    .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .round, lineJoin: .round))
                if !track.points.isEmpty {
                    Circle()
                        .fill(Theme.paper)
                        .frame(width: line * 2.6, height: line * 2.6)
                        .overlay(Circle().stroke(color, lineWidth: line * 0.8))
                        .position(shape.point(0, in: rect))
                }
            }
        }
        .padding(line * 2)
        .onAppear {
            guard draws else { return }
            drawn = 0
            withAnimation(.easeInOut(duration: 1.6)) { drawn = 1 }
        }
    }
}

// MARK: - Faces

/// A driver's official cut-out on their team's colour; their code if there is none.
struct DriverFace: View {
    let photo: String?
    let code: String?
    let color: String
    var size: CGFloat = 36

    var body: some View {
        let team = Color(f1Hex: color)
        ZStack {
            LinearGradient(colors: [team, team.opacity(0.35)], startPoint: .top, endPoint: .bottom)
            if let photo {
                RemoteImage(url: photo, anchor: .top)
            } else {
                Text(code ?? "")
                    .font(.sora(size * 0.3, .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
    }
}

/// A team's white logo on its own colour, as formula1.com shows it.
struct TeamLogo: View {
    let logo: String?
    let name: String
    let color: String
    var size: CGFloat = 36

    var body: some View {
        let team = Color(f1Hex: color)
        ZStack {
            LinearGradient(colors: [team, team.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing)
            if let logo {
                RemoteImage(url: logo, contentMode: .fit).padding(size * 0.16)
            } else {
                Text(String(name.prefix(1))).font(.sora(size * 0.42, .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.rect(cornerRadius: size * 0.28))
    }
}

/// "▲3" for places gained from the grid, "▼2" lost, "Pit lane" from the pits.
struct GridDelta: View {
    let grid: Int?
    let position: Int?

    var body: some View {
        if let grid, let position {
            if grid == 0 {
                chip("Pit lane", Theme.muted)
            } else if grid > position {
                chip("▲\(grid - position)", Theme.green)
            } else if grid < position {
                chip("▼\(position - grid)", Color(hex: 0xFF5A5A))
            } else {
                chip("=", Theme.faint)
            }
        }
    }

    private func chip(_ text: String, _ color: Color) -> some View {
        Text(text).font(.sora(11, .semibold).monospacedDigit()).foregroundStyle(color)
    }
}

// MARK: - Next race

private struct NextRaceCard: View {
    let race: F1Race
    let watch: F1Watch
    var wide = false
    let openWatch: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topTrailing) {
                if let track = race.track {
                    TrackMap(track: track, color: f1Red, line: wide ? 4.5 : 3.5, draws: true)
                        .frame(width: wide ? 320 : 168, height: wide ? 190 : 150)
                        .padding(.top, 8)
                        .padding(.trailing, 6)
                        .opacity(0.95)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("ROUND \(race.round) · \(race.sprint ? "SPRINT WEEKEND" : "RACE WEEKEND")")
                        .font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                    Text("\(flag(race.country)) \(race.name)")
                        .font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.trailing, race.track == nil ? 0 : wide ? 360 : 120)
                    Text("\(race.circuit) · \(race.locality)")
                        .font(.sora(13)).foregroundStyle(Theme.muted)
                        .padding(.trailing, race.track == nil ? 0 : wide ? 360 : 140)
                    if let track = race.track {
                        Text(String(format: "%.3f km · first GP %d", Double(track.length) / 1000, track.firstGp))
                            .font(.sora(12).monospacedDigit()).foregroundStyle(Theme.faint)
                            .padding(.top, 2)
                    }
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
                        .padding(.top, 14)
                    }
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            SessionList(sessions: race.sessions)
        }
        .background {
            ZStack {
                Theme.surface
                LinearGradient(colors: [f1Red.opacity(0.3), .clear], startPoint: .topTrailing, endPoint: UnitPoint(x: 0.25, y: 0.55))
            }
        }
        .clipShape(.rect(cornerRadius: 22))
        .contentShape(.rect(cornerRadius: 22))
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
            Image(systemName: "eye.slash").font(.title2).foregroundStyle(Theme.muted)
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

// MARK: - Results

/// The top three on steps: second, winner, third — faces, codes, team colours.
struct Podium: View {
    let rows: [F1Result]
    @Environment(\.f1Open) private var open

    var body: some View {
        let top = Array(rows.prefix(3))
        HStack(alignment: .bottom, spacing: 10) {
            ForEach([1, 0, 2].filter { $0 < top.count }, id: \.self) { i in
                step(top[i], place: i + 1)
            }
        }
        .padding(.top, 8)
    }

    private func step(_ r: F1Result, place: Int) -> some View {
        let team = Color(f1Hex: r.color)
        let face: CGFloat = place == 1 ? 86 : 68
        let height: CGFloat = place == 1 ? 78 : place == 2 ? 58 : 44
        return Button { open(.driver(r.driverId)) } label: {
            VStack(spacing: 8) {
                DriverFace(photo: r.photo, code: r.code, color: r.color, size: face)
                    .overlay(alignment: .bottomTrailing) {
                        if r.fastest {
                            Image(systemName: "stopwatch.fill").font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white).padding(5).background(fastestPurple, in: .circle)
                        }
                    }
                VStack(spacing: 1) {
                    Text(r.code ?? r.driver).font(.sora(15, .bold)).foregroundStyle(Theme.paper)
                    Text(r.team).font(.sora(11)).foregroundStyle(Theme.muted).lineLimit(1)
                    HStack(spacing: 4) {
                        if let grid = r.grid, grid > 0 {
                            Text("from P\(grid)").font(.sora(11).monospacedDigit()).foregroundStyle(Theme.faint)
                        }
                        GridDelta(grid: r.grid, position: r.position)
                    }
                }
                ZStack(alignment: .top) {
                    LinearGradient(colors: [team.opacity(0.85), team.opacity(0.25)], startPoint: .top, endPoint: .bottom)
                    Text("\(place)").font(.sora(place == 1 ? 32 : 26, .bold)).foregroundStyle(.white).padding(.top, 6)
                }
                .frame(height: height)
                .clipShape(.rect(topLeadingRadius: 12, topTrailingRadius: 12))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

/// Every finisher: face, team colour, where they started and where they ended up.
struct ResultsBoard: View {
    let results: F1Results
    @State private var tab = "race"
    @State private var all = false

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
                    .pickerWidth()
                    .padding(12)
                }
                let current = tabs.contains(where: { $0.0 == tab }) ? tab : tabs[0].0
                let list = rows(current)
                ForEach(all ? list : Array(list.prefix(10)), id: \.driverId) { r in
                    F1ResultLine(r: r, quali: current == "quali")
                }
                if list.count > 10 {
                    Button(all ? "Show top ten" : "Show all \(list.count)") {
                        withAnimation(.smooth) { all.toggle() }
                    }
                    .font(.sora(13.5, .semibold))
                    .foregroundStyle(Theme.green)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                }
            }
        }
        .background(Theme.surface, in: .rect(cornerRadius: 18))
    }
}

private struct F1ResultLine: View {
    let r: F1Result
    let quali: Bool
    @Environment(\.f1Open) private var open

    var body: some View {
        Button { open(.driver(r.driverId)) } label: {
            HStack(spacing: 11) {
                Text(r.position.map(String.init) ?? "–")
                    .font(.sora(13, (r.position ?? 99) <= 3 ? .bold : .regular).monospacedDigit())
                    .foregroundStyle((r.position ?? 99) <= 3 ? Theme.paper : Theme.faint)
                    .frame(width: 22, alignment: .leading)
                DriverFace(photo: r.photo, code: r.code, color: r.color, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(r.driver).font(.sora(14, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                        if r.fastest {
                            Text("FL").font(.sora(9.5, .bold)).foregroundStyle(.white)
                                .padding(.horizontal, 5).padding(.vertical, 1.5)
                                .background(fastestPurple, in: .capsule)
                        }
                    }
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 1).fill(Color(f1Hex: r.color)).frame(width: 3, height: 10)
                        Text(r.team).font(.sora(11.5)).foregroundStyle(Theme.faint).lineLimit(1)
                        if !quali, let grid = r.grid {
                            Text(grid == 0 ? "· pit lane" : "· from P\(grid)")
                                .font(.sora(11.5).monospacedDigit()).foregroundStyle(Theme.faint)
                        }
                    }
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(r.detail).font(.sora(12.5).monospacedDigit()).foregroundStyle(Theme.muted).lineLimit(1)
                    if !quali { GridDelta(grid: r.grid, position: r.position) }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Standings

private struct StandingsList: View {
    let rows: [F1Standing]
    let teams: Bool
    @Environment(\.f1Open) private var open

    var body: some View {
        let leader = max(rows.first?.points ?? 1, 1)
        VStack(spacing: 0) {
            ForEach(rows, id: \.id) { s in
                Button { open(teams ? .team(s.id) : .driver(s.id)) } label: {
                    HStack(spacing: 12) {
                        Text("\(s.position)")
                            .font(.sora(13, s.position <= 3 ? .bold : .regular).monospacedDigit())
                            .foregroundStyle(s.position <= 3 ? Theme.paper : Theme.faint)
                            .frame(width: 22, alignment: .leading)
                        if teams {
                            TeamLogo(logo: s.photo, name: s.name, color: s.color, size: 38)
                        } else {
                            DriverFace(photo: s.photo, code: s.code, color: s.color, size: 38)
                        }
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(s.name).font(.sora(14, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                                Spacer(minLength: 6)
                                Text(points(s.points)).font(.sora(14, .semibold).monospacedDigit()).foregroundStyle(Theme.paper)
                            }
                            // Points as a bar against the leader's.
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(.white.opacity(0.06))
                                    Capsule().fill(Color(f1Hex: s.color))
                                        .frame(width: max(4, geo.size.width * s.points / leader))
                                }
                            }
                            .frame(height: 4)
                            HStack(spacing: 6) {
                                if let team = s.team { Text(team) }
                                if s.wins > 0 { Text("\(s.team == nil ? "" : "· ")\(s.wins) win\(s.wins == 1 ? "" : "s")") }
                            }
                            .font(.sora(11)).foregroundStyle(Theme.faint).lineLimit(1)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
        .background(Theme.surface, in: .rect(cornerRadius: 18))
    }
}

// MARK: - Season

/// One round on the season wall: its circuit, its dates, and — once it has
/// run and you may see it — who stood on the podium.
private struct RaceTile: View {
    let race: F1Race

    var body: some View {
        let next = race.status == "next" || race.status == "live"
        let done = race.status == "done"
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                if let track = race.track {
                    TrackMap(track: track, color: next ? f1Red : done ? Theme.paper.opacity(0.75) : Theme.muted, line: 2.2)
                        .frame(maxWidth: .infinity)
                        .frame(height: 80)
                        .padding(.top, 12)
                } else {
                    Color.clear.frame(height: 92)
                }
                Text("R\(race.round)").font(.sora(11, .semibold).monospacedDigit()).foregroundStyle(Theme.faint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("\(flag(race.country)) \(race.name.replacingOccurrences(of: " Grand Prix", with: ""))")
                    .font(.sora(14.5, .semibold)).foregroundStyle(Theme.paper).lineLimit(1)
                Text(dates + (race.sprint ? " · Sprint" : "")).font(.sora(11.5)).foregroundStyle(Theme.faint)
            }
            // Always 30pt, even with nothing in it, so every tile in a row is the same height.
            ZStack(alignment: .leading) {
                Color.clear
                footer
            }
            .frame(height: 30)
        }
        .padding(12)
        .background {
            ZStack {
                Theme.surface
                if next {
                    LinearGradient(colors: [f1Red.opacity(0.28), .clear], startPoint: .top, endPoint: .bottom)
                }
            }
        }
        .clipShape(.rect(cornerRadius: 18))
        .overlay {
            if next { RoundedRectangle(cornerRadius: 18).stroke(f1Red.opacity(0.7), lineWidth: 1) }
        }
        .opacity(race.status == "upcoming" ? 0.8 : 1)
    }

    private var dates: String {
        guard let first = race.sessions.first?.date, let last = F1Time.parse(race.at) else { return "" }
        return "\(F1Time.dayMonth(first)) – \(F1Time.dayMonth(last))"
    }

    @ViewBuilder
    private var footer: some View {
        if let podium = race.podium, let winner = podium.first {
            HStack(spacing: 8) {
                HStack(spacing: -8) {
                    ForEach(podium, id: \.driverId) { r in
                        DriverFace(photo: r.photo, code: r.code, color: r.color, size: 26)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(winner.code ?? winner.driver).font(.sora(12.5, .bold)).foregroundStyle(Theme.paper)
                    Text(winner.team).font(.sora(10)).foregroundStyle(Theme.faint).lineLimit(1)
                }
            }
        } else {
            switch race.status {
            case "live":
                Text("● Live").font(.sora(11.5, .semibold)).padding(.horizontal, 9).padding(.vertical, 4)
                    .background(f1Red, in: .capsule).foregroundStyle(.white)
            case "next":
                if let d = F1Time.parse(race.at) {
                    Text("Next · in \(F1Time.until(d, from: .now))").font(.sora(11.5, .semibold)).foregroundStyle(f1Red)
                }
            case "done":
                Label(race.watched ? "Results soon" : "Hidden", systemImage: race.watched ? "clock" : "eye.slash")
                    .font(.sora(11.5)).foregroundStyle(Theme.faint)
            default:
                EmptyView()
            }
        }
    }
}

// MARK: - Sheets

/// A round, a driver or a team, with room to go from one to the next:
/// a podium's face opens the driver, the driver's team opens the team.
private struct F1Sheet: View {
    let root: F1Link
    let changed: () -> Void
    @State private var path: [F1Link] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack(path: $path) {
            page(root)
                .navigationDestination(for: F1Link.self) { page($0) }
        }
        .environment(\.f1Open) { link in
            if link != root && path.last != link { path.append(link) }
        }
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func page(_ link: F1Link) -> some View {
        Group {
            switch link {
            case .round(let race): F1RoundPage(race: race, changed: changed)
            case .driver(let id): F1DriverPage(id: id)
            case .team(let id): F1TeamPage(id: id)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { dismiss() } label: { Image(systemName: "xmark") }
                    .accessibilityLabel("Close")
            }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One round: its track drawn in, its numbers, its sessions in Cairo time,
/// and its results once they may be shown.
private struct F1RoundPage: View {
    let race: F1Race
    let changed: () -> Void
    @Environment(API.self) private var api
    @State private var detail: F1RoundDetail?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 14) {
                    if let track = race.track {
                        // A finished race in its winner's colours; one to come in F1 red.
                        let tint = race.podium?.first.map { Color(f1Hex: $0.color) } ?? (race.status == "done" ? Theme.paper : f1Red)
                        TrackMap(track: track, color: tint, line: 4, draws: true)
                            .frame(height: 230)
                            .frame(maxWidth: .infinity)
                            .background {
                                RadialGradient(colors: [tint.opacity(0.22), .clear], center: .center, startRadius: 10, endRadius: 190)
                            }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("ROUND \(race.round)\(race.sprint ? " · SPRINT WEEKEND" : "")")
                            .font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                        Text("\(flag(race.country)) \(race.name)").font(.sora(26, .bold)).foregroundStyle(Theme.paper)
                        Text("\(race.circuit) · \(race.locality), \(race.country)").font(.sora(13)).foregroundStyle(Theme.muted)
                    }
                    if let track = race.track {
                        HStack(spacing: 10) {
                            Stat(value: String(format: "%.3f", Double(track.length) / 1000), label: "km a lap")
                            Stat(value: String(track.firstGp), label: "first GP")
                            if let d = F1Time.parse(race.at) { Stat(value: F1Time.dayMonth(d), label: "race day") }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)

                SessionList(sessions: race.sessions)
                    .background(Theme.surface, in: .rect(cornerRadius: 18))
                    .padding(.horizontal, 20)

                Group {
                    if race.status == "done" {
                        if let results = detail?.results {
                            VStack(alignment: .leading, spacing: 14) {
                                if !results.race.isEmpty { Podium(rows: results.race) }
                                ResultsBoard(results: results)
                            }
                        } else if detail != nil {
                            ShieldCard(signedIn: api.user != nil) {
                                try? await api.setF1Watched(season: race.season, round: race.round, true)
                                api.touch()
                                await load()
                                changed()
                            }
                        } else {
                            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 30)
                        }
                    } else {
                        Text("The podium and every result land here once the race is run.")
                            .font(.sora(13.5)).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.bottom, 40)
        }
        .background(Theme.ink)
        .task { await load() }
    }

    private func load() async {
        if detail == nil { detail = api.peek("/api/f1/round/\(race.round)") }
        detail = (try? await api.f1Round(race.round)) ?? detail
    }
}

private struct Stat: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.sora(16, .bold).monospacedDigit()).foregroundStyle(Theme.paper)
            Text(label).font(.sora(11)).foregroundStyle(Theme.faint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Theme.surface, in: .rect(cornerRadius: 14))
    }
}

/// A driver: their photo big, number in the team's colour, the career in
/// numbers, this season round by round, and who they are.
private struct F1DriverPage: View {
    let id: String
    @Environment(API.self) private var api
    @Environment(\.f1Open) private var open
    @Environment(\.openURL) private var openURL
    @State private var driver: F1Driver?
    @State private var failed = false

    var body: some View {
        ScrollView {
            if let d = driver {
                content(d)
            } else if failed {
                Text("This driver can't be loaded right now.").font(.sora(14)).foregroundStyle(Theme.muted).padding(40)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
            }
        }
        .background(Theme.ink)
        .ignoresSafeArea(edges: .top)
        .task { await load() }
    }

    private func content(_ d: F1Driver) -> some View {
        let team = Color(f1Hex: d.color)
        return VStack(alignment: .leading, spacing: 22) {
            ZStack(alignment: .bottomLeading) {
                // The team's colour, the car number huge behind, the driver in front.
                LinearGradient(colors: [team.opacity(0.85), team.opacity(0.3), Theme.ink], startPoint: .top, endPoint: .bottom)
                if let number = d.number {
                    Text(number)
                        .font(.sora(230, .bold))
                        .foregroundStyle(.white.opacity(0.14))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(.top, 50).padding(.leading, 12)
                        .lineLimit(1)
                }
                if let photo = d.photo {
                    // Head to knee, standing on the right; in an overlay so the
                    // tall cut-out cannot stretch the layout.
                    Color.clear
                        .frame(width: 250)
                        .frame(maxHeight: .infinity)
                        .overlay(alignment: .top) { RemoteImage(url: photo, anchor: .top) }
                        .clipped()
                        .padding(.top, 36)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                LinearGradient(colors: [.clear, Theme.ink.opacity(0.85), Theme.ink], startPoint: UnitPoint(x: 0.5, y: 0.5), endPoint: .bottom)
                VStack(alignment: .leading, spacing: 6) {
                    Text(d.name).font(.sora(30, .bold)).foregroundStyle(Theme.paper)
                    HStack(spacing: 8) {
                        if let teamName = d.team {
                            Button {
                                if let teamId = d.teamId { open(.team(teamId)) }
                            } label: {
                                HStack(spacing: 6) {
                                    RoundedRectangle(cornerRadius: 1.5).fill(team).frame(width: 4, height: 14)
                                    Text(teamName).font(.sora(14, .semibold)).foregroundStyle(Theme.paper)
                                    if d.teamId != nil { Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.muted) }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        Text([d.nationality.map { "\(flag($0)) \($0)" }, age(d.born)].compactMap { $0 }.joined(separator: " · "))
                            .font(.sora(13)).foregroundStyle(Theme.muted)
                    }
                }
                .padding(.horizontal, 20)
            }
            .frame(height: 470)
            .clipped()

            VStack(alignment: .leading, spacing: 10) {
                Text("\(String(d.season.year)) SEASON").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    Stat(value: d.season.position.map { "P\($0)" } ?? "—", label: "standing")
                    Stat(value: d.season.points.map(points) ?? "—", label: "points")
                    Stat(value: d.season.wins.map(String.init) ?? "—", label: "wins")
                }
                Text("CAREER").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted).padding(.top, 8)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                    Stat(value: count(d.career.titles), label: "titles")
                    Stat(value: count(d.career.wins), label: "wins")
                    Stat(value: count(d.career.podiums), label: "podiums")
                    Stat(value: count(d.career.poles), label: "poles")
                    Stat(value: count(d.career.starts), label: "starts")
                    if let number = d.number { Stat(value: "#\(number)", label: "car") }
                }
            }
            .padding(.horizontal, 20)

            SeasonRounds(rounds: d.season.rounds, showDriver: false)

            About(bio: d.bio, wiki: d.wiki)
        }
        .padding(.bottom, 40)
    }

    private func count(_ n: Int?) -> String { n.map(String.init) ?? "—" }

    private func age(_ born: String?) -> String? {
        guard let born, let date = ISO8601DateFormatter().date(from: born + "T00:00:00Z"),
              let years = Calendar.current.dateComponents([.year], from: date, to: .now).year else { return nil }
        return "\(years)"
    }

    private func load() async {
        if driver == nil { driver = api.peek("/api/f1/driver/\(id)") }
        do { driver = try await api.f1Driver(id) } catch { failed = driver == nil }
    }
}

/// A team: logo over its colour, the numbers, its two drivers, its season.
private struct F1TeamPage: View {
    let id: String
    @Environment(API.self) private var api
    @Environment(\.f1Open) private var open
    @State private var team: F1Team?
    @State private var failed = false

    var body: some View {
        ScrollView {
            if let t = team {
                content(t)
            } else if failed {
                Text("This team can't be loaded right now.").font(.sora(14)).foregroundStyle(Theme.muted).padding(40)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
            }
        }
        .background(Theme.ink)
        .ignoresSafeArea(edges: .top)
        .task { await load() }
    }

    private func content(_ t: F1Team) -> some View {
        let color = Color(f1Hex: t.color)
        return VStack(alignment: .leading, spacing: 22) {
            // As formula1.com shows a team: the white logo on its colour, the car below.
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 16) {
                    TeamLogo(logo: t.photo, name: t.name, color: t.color, size: 84)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t.name).font(.sora(28, .bold)).foregroundStyle(.white)
                        if let n = t.nationality {
                            Text("\(flag(n)) \(n)").font(.sora(13)).foregroundStyle(.white.opacity(0.75))
                        }
                    }
                }
                if let car = t.car {
                    RemoteImage(url: car, contentMode: .fit)
                        .frame(height: 120)
                        .frame(maxWidth: .infinity)
                        .shadow(color: .black.opacity(0.45), radius: 12, y: 12)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 76)
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                LinearGradient(colors: [color, color.opacity(0.35), Theme.ink], startPoint: .top, endPoint: .bottom)
            }

            if !t.drivers.isEmpty {
                let current = t.drivers.filter { $0.current == true }
                let others = t.drivers.filter { $0.current != true }
                VStack(alignment: .leading, spacing: 10) {
                    Text("\(String(t.season.year)) DRIVERS").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                    HStack(spacing: 12) {
                        ForEach(current, id: \.id) { seat in
                            Button { open(.driver(seat.id)) } label: {
                                VStack(spacing: 8) {
                                    DriverFace(photo: seat.photo, code: seat.code, color: t.color, size: 92)
                                    Text(seat.name).font(.sora(13.5, .semibold)).foregroundStyle(Theme.paper)
                                        .multilineTextAlignment(.center).lineLimit(2)
                                    if let n = seat.number {
                                        Text("#\(n)").font(.sora(12, .bold).monospacedDigit()).foregroundStyle(color)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Theme.surface, in: .rect(cornerRadius: 18))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if !others.isEmpty {
                        Text("ALSO DROVE THIS YEAR").font(.sora(11, .semibold)).foregroundStyle(Theme.faint).padding(.top, 4)
                        ScrollView(.horizontal) {
                            HStack(spacing: 8) {
                                ForEach(others, id: \.id) { seat in
                                    Button { open(.driver(seat.id)) } label: {
                                        HStack(spacing: 8) {
                                            DriverFace(photo: seat.photo, code: seat.code, color: t.color, size: 28)
                                            Text(seat.name).font(.sora(13, .medium)).foregroundStyle(Theme.paper)
                                        }
                                        .padding(.leading, 5).padding(.trailing, 12).padding(.vertical, 5)
                                        .background(Theme.surface, in: .capsule)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
                    }
                }
                .padding(.horizontal, 20)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("\(String(t.season.year)) SEASON").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                HStack(spacing: 10) {
                    Stat(value: t.season.position.map { "P\($0)" } ?? "—", label: "standing")
                    Stat(value: t.season.points.map(points) ?? "—", label: "points")
                    Stat(value: t.season.wins.map(String.init) ?? "—", label: "wins")
                }
                Text("ALL TIME").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted).padding(.top, 8)
                HStack(spacing: 10) {
                    Stat(value: t.career.titles.map(String.init) ?? "—", label: "titles")
                    Stat(value: t.career.wins.map(String.init) ?? "—", label: "wins")
                    Stat(value: t.career.starts.map(String.init) ?? "—", label: "races")
                }
            }
            .padding(.horizontal, 20)

            SeasonRounds(rounds: t.season.rounds, showDriver: true)

            About(bio: t.bio, wiki: t.wiki)
        }
        .padding(.bottom, 40)
    }

    private func load() async {
        if team == nil { team = api.peek("/api/f1/team/\(id)") }
        do { team = try await api.f1Team(id) } catch { failed = team == nil }
    }
}

/// This season round by round: where they started, where they finished.
private struct SeasonRounds: View {
    let rounds: [F1SeasonEntry]
    let showDriver: Bool

    var body: some View {
        if !rounds.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("ROUND BY ROUND").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                VStack(spacing: 0) {
                    ForEach(rounds.reversed(), id: \.round) { e in
                        HStack(spacing: 12) {
                            Text(e.position.map { "P\($0)" } ?? "—")
                                .font(.sora(15, .bold).monospacedDigit())
                                .foregroundStyle((e.position ?? 99) <= 3 ? Theme.green : Theme.paper)
                                .frame(width: 40, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.name.replacingOccurrences(of: " Grand Prix", with: " GP"))
                                    .font(.sora(13.5, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                                HStack(spacing: 6) {
                                    if showDriver { Text(e.driver) }
                                    if let g = e.grid { Text(g == 0 ? "pit lane" : "from P\(g)") }
                                    GridDelta(grid: e.grid, position: e.position)
                                }
                                .font(.sora(11.5)).foregroundStyle(Theme.faint)
                            }
                            Spacer()
                            Text(e.points > 0 ? "+\(points(e.points))" : "0")
                                .font(.sora(13, .semibold).monospacedDigit())
                                .foregroundStyle(e.points > 0 ? Theme.paper : Theme.faint)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                    }
                }
                .background(Theme.surface, in: .rect(cornerRadius: 18))
                .padding(.horizontal, 20)
            }
        }
    }
}

private struct About: View {
    let bio: String?
    let wiki: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let bio, !bio.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("ABOUT").font(.sora(11.5, .semibold)).foregroundStyle(Theme.muted)
                Text(bio).font(.sora(14)).foregroundStyle(Theme.paper.opacity(0.85)).lineSpacing(3)
                if let wiki, let url = URL(string: wiki) {
                    Button { openURL(url) } label: {
                        Label("More on Wikipedia", systemImage: "arrow.up.right")
                            .font(.sora(13, .semibold)).foregroundStyle(Theme.green)
                    }
                    .buttonStyle(.plain)
                }
                Text("Photo and text: Wikipedia, CC BY-SA.").font(.sora(10.5)).foregroundStyle(Theme.faint)
            }
            .padding(.horizontal, 20)
        }
    }
}
