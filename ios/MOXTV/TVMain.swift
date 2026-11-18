import SwiftUI

/// The television's tabs, along the top as tvOS has them: Home, the week's
/// episodes, Formula 1 for the owner, and Search.
struct TVMain: View {
    @Environment(API.self) private var api

    var body: some View {
        TabView {
            Tab("Home", systemImage: "house") { TVHome() }
            Tab("Calendar", systemImage: "calendar") { TVCalendar() }
            // The Sports tab is the owner's alone, as on the phone and the site.
            if api.user?.mox == true {
                Tab("F1", systemImage: "flag.checkered") { TVF1() }
            }
            Tab("Search", systemImage: "magnifyingglass", role: .search) { TVSearch() }
        }
    }
}

/// What airs, day by day: the fortnight Home's calendar already carries.
struct TVCalendar: View {
    @Environment(API.self) private var api
    @State private var home: HomePayload?
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            ZStack {
                TV.ink.ignoresSafeArea()
                if let home {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 40) {
                            ForEach(days(home), id: \.day) { day in
                                VStack(alignment: .leading, spacing: 16) {
                                    HStack(alignment: .firstTextBaseline, spacing: 16) {
                                        Text(heading(day.day, today: home.today))
                                            .font(.system(size: 34, weight: .semibold))
                                            .foregroundStyle(day.day == home.today ? TV.green : TV.paper)
                                        Text("\(day.episodes.count) episode\(day.episodes.count == 1 ? "" : "s")")
                                            .font(.system(size: 24)).foregroundStyle(TV.muted)
                                    }
                                    .padding(.horizontal, TV.edge)
                                    ScrollView(.horizontal) {
                                        LazyHStack(alignment: .top, spacing: 36) {
                                            ForEach(day.episodes) { episode in
                                                TVEpisodeCard(episode: episode)
                                            }
                                        }
                                        .padding(.horizontal, TV.edge)
                                        .padding(.vertical, 26)
                                    }
                                    .scrollClipDisabled()
                                }
                                .focusSection()
                            }
                            if days(home).isEmpty {
                                Text("Nothing on the calendar for the next two weeks.")
                                    .font(.system(size: 28)).foregroundStyle(TV.muted)
                                    .padding(TV.edge)
                            }
                        }
                        .padding(.vertical, 40)
                    }
                    .scrollClipDisabled()
                    .ignoresSafeArea(edges: .horizontal)
                } else if let problem {
                    Text(problem).font(.system(size: 28)).foregroundStyle(.orange)
                } else {
                    ProgressView()
                }
            }
            .tvDestinations()
        }
        .task(id: api.revision) {
            if home == nil { home = api.peek("/api/app/home") }
            do { home = try await api.home() } catch { if home == nil { problem = "Can't reach MOX: \(error.localizedDescription)" } }
        }
    }

    private struct Day { let day: String; let episodes: [CalendarEpisode] }

    /// From today on, in order; the shows he follows first within a day.
    private func days(_ home: HomePayload) -> [Day] {
        Dictionary(grouping: home.calendar.filter { $0.airs >= home.today }, by: \.airs)
            .map { Day(day: $0.key, episodes: $0.value.sorted { ($0.following ? 0 : 1, $0.show) < ($1.following ? 0 : 1, $1.show) }) }
            .sorted { $0.day < $1.day }
    }

    private func heading(_ day: String, today: String) -> String {
        if day == today { return "Today" }
        let parse = DateFormatter()
        parse.dateFormat = "yyyy-MM-dd"
        parse.timeZone = TimeZone(identifier: "Africa/Cairo")
        guard let date = parse.date(from: day) else { return day }
        let show = DateFormatter()
        show.locale = Locale(identifier: "en_GB")
        show.timeZone = parse.timeZone
        show.dateFormat = "EEEE d MMMM"
        return show.string(from: date)
    }
}

private struct TVEpisodeCard: View {
    let episode: CalendarEpisode

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Group {
                if let id = episode.tmdbId {
                    NavigationLink(value: TitleRef(tmdbId: id, kind: "tv")) { poster }
                } else {
                    Button {} label: { poster }
                }
            }
            .buttonStyle(.card)
            VStack(alignment: .leading, spacing: 4) {
                Text(episode.show)
                    .font(.system(size: 23, weight: .medium))
                    .foregroundStyle(TV.paper)
                    .lineLimit(1)
                Text(episode.code + (episode.platforms.first.map { " · \($0.name)" } ?? ""))
                    .font(.system(size: 21))
                    .foregroundStyle(episode.following ? TV.green : TV.muted)
                    .lineLimit(1)
            }
            .frame(width: 200, alignment: .leading)
        }
    }

    private var poster: some View {
        TVImage(path: episode.poster).frame(width: 200, height: 300)
    }
}

/// Search, with the system's own keyboard and dictation.
struct TVSearch: View {
    @Environment(API.self) private var api
    @State private var query = ""
    @State private var titles: [Card] = []
    @State private var people: [PersonHit] = []
    @State private var searched = ""
    @State private var problem: String?

    private let columns = Array(repeating: GridItem(.fixed(220), spacing: 36), count: 6)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 36) {
                    if let problem {
                        Text(problem).font(.system(size: 26)).foregroundStyle(.orange)
                    } else if titles.isEmpty, !searched.isEmpty {
                        Text("Nothing found for “\(searched)”.")
                            .font(.system(size: 28)).foregroundStyle(TV.muted)
                    }
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 50) {
                        ForEach(titles) { card in
                            NavigationLink(value: card.ref) {
                                TVImage(path: card.poster).frame(width: 220, height: 330)
                            }
                            .buttonStyle(.card)
                            .accessibilityLabel(card.title)
                        }
                    }
                    if !people.isEmpty {
                        TVPeopleRow(title: "People", people: people.map {
                            PersonChip(id: $0.id, name: $0.name, profile: $0.profile, role: $0.department)
                        })
                        .padding(.horizontal, -TV.edge)
                    }
                }
                .padding(.horizontal, TV.edge)
                .padding(.vertical, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollClipDisabled()
            .background(TV.ink.ignoresSafeArea())
            .searchable(text: $query, prompt: "Films, series, people")
            .tvDestinations()
        }
        .task(id: query) {
            let asked = query.trimmingCharacters(in: .whitespaces)
            guard asked.count >= 2 else { titles = []; people = []; searched = ""; return }
            // Typing with a remote is slow: wait for a pause before asking.
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            do {
                let found = try await api.search(asked)
                guard !Task.isCancelled else { return }
                titles = found.titles
                people = found.people
                searched = asked
                problem = nil
            } catch {
                if !Task.isCancelled { problem = "Search didn't answer: \(error.localizedDescription)" }
            }
        }
    }
}
