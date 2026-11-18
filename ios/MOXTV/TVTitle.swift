import SwiftUI

/// A title's page. The first button is the point of the whole app: it opens
/// the service's own app on this title.
struct TVTitle: View {
    @Environment(API.self) private var api
    let ref: TitleRef

    @State private var detail: TitleDetail?
    @State private var problem: String?
    @State private var notice: String?
    @FocusState private var focus: String?

    var body: some View {
        ZStack {
            TV.ink.ignoresSafeArea()
            if let detail {
                GeometryReader { geo in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 44) {
                            // The first screen is the picture and the button; the
                            // rest is a swipe down.
                            ZStack(alignment: .bottomLeading) {
                                TVImage(path: detail.backdrop?.replacingOccurrences(of: "/t/p/w780/", with: "/t/p/w1280/") ?? detail.poster)
                                    .frame(width: geo.size.width, height: geo.size.height)
                                    .clipped()
                                LinearGradient(stops: [
                                    .init(color: TV.ink.opacity(0.95), location: 0),
                                    .init(color: TV.ink.opacity(0.55), location: 0.5),
                                    .init(color: .clear, location: 1),
                                ], startPoint: .leading, endPoint: .trailing)
                                LinearGradient(colors: [.clear, TV.ink], startPoint: .center, endPoint: .bottom)
                                content(detail)
                            }
                            .frame(width: geo.size.width, height: geo.size.height)
                            if let people = detail.people, !people.isEmpty {
                                TVPeopleRow(title: "Cast and crew", people: people)
                            }
                            if let parts = detail.parts, !parts.isEmpty {
                                TVRow(title: "The collection", cards: parts)
                            }
                            if let similar = detail.similar, !similar.isEmpty {
                                TVRow(title: "More like this", cards: similar)
                            }
                        }
                        .padding(.bottom, 80)
                    }
                    .scrollClipDisabled()
                    // The page opens on its Play button, not on whichever row the
                    // focus engine finds nearest the middle of the screen.
                    .defaultFocus($focus, detail.platforms.first?.name)
                }
                .ignoresSafeArea()
            } else if let problem {
                Text(problem).font(.system(size: 30)).foregroundStyle(.orange).padding(TV.edge)
            } else {
                ProgressView()
            }
        }
        .task {
            do {
                let loaded = try await api.title(ref)
                detail = loaded
                // `-tvPlay YES` with `-tvOpen`: press the first button, for
                // checking a link on a television nobody is holding the remote of.
                if UserDefaults.standard.bool(forKey: "tvPlay"), let platform = loaded.platforms.first {
                    await open(TVLink.target(for: platform), platform, loaded)
                }
            } catch {
                problem = "Can't load this title: \(error.localizedDescription)"
            }
        }
        // A title fills the screen; the tabs come back with Back.
        .toolbar(.hidden, for: .tabBar)
        .alert("MOX", isPresented: .init(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") {}
        } message: {
            Text(notice ?? "")
        }
    }

    private func content(_ d: TitleDetail) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(d.title)
                .font(.system(size: 76, weight: .bold))
                .foregroundStyle(TV.paper)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            Text(facts(d))
                .font(.system(size: 28))
                .foregroundStyle(TV.muted)
            if let next = d.progress?.next {
                Text("Next for you: S\(next.season) E\(next.episode)")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(TV.green)
            }
            if let overview = d.overview, !overview.isEmpty {
                Text(overview)
                    .font(.system(size: 28))
                    .foregroundStyle(TV.paper.opacity(0.85))
                    .lineLimit(4)
                    .frame(maxWidth: 980, alignment: .leading)
            }
            buttons(d)
                .padding(.top, 14)
        }
        .padding(.horizontal, TV.edge)
        .padding(.bottom, 70)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func buttons(_ d: TitleDetail) -> some View {
        if d.platforms.isEmpty {
            Text("Not on your services right now.")
                .font(.system(size: 28))
                .foregroundStyle(TV.muted)
                .focusable()
        } else {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 24) {
                    ForEach(d.platforms, id: \.name) { platform in
                        let link = TVLink.target(for: platform)
                        Button {
                            Task { await open(link, platform, d) }
                        } label: {
                            Label(label(link, platform), systemImage: link.landing == .none ? "magnifyingglass" : "play.fill")
                                .font(.system(size: 30, weight: .semibold))
                                .padding(.horizontal, 12)
                        }
                        .focused($focus, equals: platform.name)
                    }
                }
                .focusSection()
                // Said before the press, not after it: what this button can and cannot do.
                if let platform = d.platforms.first(where: { $0.name == focus }) ?? d.platforms.first {
                    Text(caption(TVLink.target(for: platform), platform, d))
                        .font(.system(size: 24))
                        .foregroundStyle(TV.muted)
                }
            }
        }
    }

    private func facts(_ d: TitleDetail) -> String {
        var parts: [String] = []
        if let year = d.year { parts.append(String(year)) }
        if let seasons = d.seasons, seasons > 0 { parts.append(seasons == 1 ? "1 season" : "\(seasons) seasons") }
        if let runtime = d.runtime, runtime > 0 { parts.append("\(runtime / 60)h \(runtime % 60)m") }
        if let age = d.age { parts.append(age) }
        if let imdb = d.imdb { parts.append("IMDb " + String(format: "%.1f", imdb.rating)) }
        parts.append(contentsOf: d.genres.prefix(3))
        return parts.joined(separator: "  ·  ")
    }

    private func label(_ link: TVLink, _ platform: Platform) -> String {
        switch link.landing {
        case .title, .plays, .untried: "Play on \(platform.name)"
        case .appOnly: "Open \(platform.name)"
        case .none: "On \(platform.name)"
        }
    }

    private func caption(_ link: TVLink, _ platform: Platform, _ d: TitleDetail) -> String {
        switch link.landing {
        case .title: "Opens \(platform.name) on this title."
        case .plays: "Opens \(platform.name) and starts playing."
        case .untried: "Opens \(platform.name); it should land on this title."
        case .appOnly: "Opens \(platform.name) — search for “\(d.title)” there."
        case .none: "\(platform.name) can't be opened from here. Open it from the Home Screen and search for “\(d.title)”."
        }
    }

    private func open(_ link: TVLink, _ platform: Platform, _ d: TitleDetail) async {
        if link.landing == .none {
            notice = caption(link, platform, d)
        } else if !(await link.open()) {
            // The link was right when it was tested; the app is not installed,
            // or it stopped taking it. Say so rather than do nothing.
            notice = "\(platform.name) didn't open. If it's installed, open it from the Home Screen and search for “\(d.title)”."
        }
    }
}
