import SwiftUI

// The iPad's own screens, after the Apple TV app: a featured title across the
// top of Home, shelves of wide pictures rather than posters, Search as a place
// of its own in the sidebar, and titles that open as a full page. On an iPhone
// none of this is used — every screen here is chosen by the regular size class.

// MARK: - Cards

/// A title as a wide picture with its name under it — the iPad's card.
struct WideCard: View {
    let card: Card
    var width: CGFloat = 300
    var caption: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Color.clear
                .frame(width: width, height: width * 9 / 16)
                .overlay { RemoteImage(url: card.backdrop ?? card.poster) }
                .overlay(alignment: .topLeading) {
                    if let tag = card.episodeLabel ?? card.releaseLabel {
                        Text(tag)
                            .font(.sora(11, .semibold, relativeTo: .caption2))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.black.opacity(0.65), in: .capsule)
                            .foregroundStyle(Theme.mint)
                            .padding(10)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    if let friends = card.friends, !friends.isEmpty { FriendFaces(friends: friends, size: 24).padding(10) }
                }
                .clipShape(.rect(cornerRadius: 14))
            Text(card.title)
                .font(.sora(15, .semibold, relativeTo: .subheadline))
                .foregroundStyle(Theme.paper)
                .lineLimit(1)
            Text(caption ?? card.reason ?? card.platforms.first?.name ?? card.year.map(String.init) ?? " ")
                .font(.sora(12.5, relativeTo: .caption))
                .foregroundStyle(caption == nil && card.reason != nil ? Theme.mint : Theme.muted)
                .lineLimit(1)
        }
        .frame(width: width, alignment: .leading)
        .contentShape(.rect)
    }
}

/// A titled row of wide cards that scrolls sideways.
struct WideShelf: View {
    let title: String
    var detail: String? = nil
    let cards: [Card]
    var width: CGFloat = 300
    var caption: (Card) -> String? = { _ in nil }
    let open: (TitleRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title).font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
                if let detail { Text(detail).font(.sora(14)).foregroundStyle(Theme.muted) }
            }
            .padding(.horizontal, IPad.margin)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 20) {
                    ForEach(cards) { card in
                        Button { open(card.ref) } label: { WideCard(card: card, width: width, caption: caption(card)) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, IPad.margin)
            }
            .scrollIndicators(.hidden)
        }
    }
}

enum IPad {
    /// The page margin on an iPad, wider than a phone's 20.
    static let margin: CGFloat = 40
}

// MARK: - Featured

/// The top of Home: a few titles, each across the whole width with its picture,
/// name and what it is, a page at a time.
struct FeaturedCarousel: View {
    let cards: [Card]
    let open: (TitleRef) -> Void
    @State private var page: String?

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(cards) { card in
                    slide(card).containerRelativeFrame(.horizontal)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .scrollPosition(id: $page)
        .frame(height: 560)
        .overlay(alignment: .bottom) {
            HStack(spacing: 8) {
                ForEach(cards) { card in
                    Circle()
                        .fill((page ?? cards.first?.id) == card.id ? Theme.paper : Theme.paper.opacity(0.3))
                        .frame(width: 7, height: 7)
                }
            }
            .padding(.bottom, 18)
        }
    }

    private func slide(_ card: Card) -> some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear
                .overlay { RemoteImage(url: card.backdrop ?? card.poster) }
                .clipped()
            LinearGradient(colors: [.black.opacity(0.85), .black.opacity(0.2), .clear], startPoint: .bottomLeading, endPoint: .topTrailing)
            LinearGradient(colors: [Theme.ink, .clear], startPoint: .bottom, endPoint: .center)

            VStack(alignment: .leading, spacing: 12) {
                if let tag = card.episodeLabel ?? card.reason {
                    Text(tag.uppercased())
                        .font(.sora(13, .semibold, relativeTo: .caption))
                        .tracking(1.2)
                        .foregroundStyle(Theme.mint)
                }
                Text(card.title)
                    .font(.sora(46, .bold, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.paper)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text([card.year.map(String.init), card.isTV ? "Series" : "Film",
                      card.rating.map { "★ \(String(format: "%.1f", $0))" }, card.platforms.first?.name]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.sora(15, relativeTo: .subheadline))
                    .foregroundStyle(Theme.paper.opacity(0.8))
                if let overview = card.overview {
                    Text(overview)
                        .font(.sora(15, relativeTo: .body))
                        .foregroundStyle(Theme.paper.opacity(0.75))
                        .lineLimit(2)
                        .frame(maxWidth: 560, alignment: .leading)
                }
                HStack(spacing: 12) {
                    if let p = card.platforms.first, let s = p.url, let url = URL(string: s) {
                        Link(destination: url) {
                            Label("Play on \(p.name)", systemImage: "play.fill")
                                .font(.sora(16, .semibold))
                                .padding(.horizontal, 22).padding(.vertical, 13)
                                .background(Theme.paper, in: .capsule)
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    Button { open(card.ref) } label: {
                        Label("Details", systemImage: "info.circle")
                            .font(.sora(16, .semibold))
                            .padding(.horizontal, 22).padding(.vertical, 13)
                            .glassEffect(.regular.interactive(), in: .capsule)
                            .foregroundStyle(Theme.paper)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 6)
            }
            .padding(.horizontal, IPad.margin)
            .padding(.bottom, 56)
        }
        .contentShape(.rect)
        .onTapGesture { open(card.ref) }
    }
}

// MARK: - Home

/// Home on an iPad: the featured titles across the top, then shelves.
struct IPadHome: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var payload: HomePayload?
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                if let payload {
                    let featured = featured(payload)
                    if !featured.isEmpty {
                        FeaturedCarousel(cards: featured) { router.title = $0 }
                    }
                    if payload.user == nil {
                        SignInPrompt(text: "Sign in to see the new episodes of shows you follow.") { router.settings = true }
                            .padding(.horizontal, IPad.margin - 20)
                    } else if !payload.forYou.isEmpty {
                        WideShelf(title: "New for you", cards: payload.forYou, width: 360,
                                  caption: { [$0.episodeLabel, $0.platforms.first?.name].compactMap { $0 }.joined(separator: " · ") }) {
                            router.title = $0
                        }
                    }
                    if let news = payload.fromPeople, !news.isEmpty {
                        WideShelf(title: "From people you follow", cards: news.map(\.title),
                                  caption: { card in news.first { $0.title.id == card.id }?.person.name }) { router.title = $0 }
                    }
                    if !payload.trending.isEmpty {
                        WideShelf(title: "Trending", detail: "on your services", cards: payload.trending) { router.title = $0 }
                    }
                    AiringSection(episodes: payload.calendar, today: payload.today, signedIn: payload.user != nil)
                        .padding(.horizontal, IPad.margin - 20)
                } else if let loadError {
                    VStack(spacing: 10) {
                        Text("Can't reach the MOX server").font(.sora(18, .semibold))
                        Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted)
                        Button("Try again") { Task { await load() } }.buttonStyle(.glass)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 200)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 200)
                }
            }
            .padding(.bottom, 60)
        }
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .top)
        .background(Theme.ink)
        .overlay(alignment: .topTrailing) { AccountButton().padding(.trailing, 24).padding(.top, 8) }
        .refreshable { await load() }
        .task(id: api.revision) { await load() }
    }

    /// What leads: new episodes of your shows if there are any, then what is trending.
    private func featured(_ p: HomePayload) -> [Card] {
        var seen = Set<String>()
        return (p.forYou + p.trending)
            .filter { $0.backdrop != nil && seen.insert("\($0.kind)-\($0.tmdbId)").inserted }
            .prefix(6)
            .map { $0 }
    }

    private func load() async {
        do {
            payload = try await api.home()
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }
}

/// Your photo, or a person, top right: opens Settings.
struct AccountButton: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router

    var body: some View {
        Button { router.settings = true } label: {
            Group {
                if let user = api.user, let photo = api.absolute(user.avatar) {
                    RemoteImage(url: photo.absoluteString)
                } else if let user = api.user {
                    Text(user.name.prefix(1).uppercased())
                        .font(.sora(18, .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Theme.mint)
                } else {
                    Image(systemName: "person.fill").foregroundStyle(Theme.paper)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive(), in: .circle)
            .clipShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Account and settings")
    }
}

// MARK: - Search

/// Search on an iPad, a place of its own in the sidebar: the field at the top,
/// moods to start from, and results as wide cards, ten at a time.
struct IPadSearch: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var query = ""
    @State private var mood: Mood?
    @State private var results: [Card] = []
    @State private var people: [PersonChip] = []
    @State private var next: Int?
    @State private var looking = false
    @State private var loadingMore = false

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }
    private let columns = [GridItem(.adaptive(minimum: 280), spacing: 20, alignment: .top)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    moods
                    if !people.isEmpty {
                        PeopleRow(title: "People", people: people) { router.person = PersonRef(id: $0) }
                    }
                    if let mood, trimmed.isEmpty {
                        Text(mood.label).font(.sora(24, .bold)).foregroundStyle(Theme.paper)
                            .padding(.horizontal, IPad.margin)
                    }
                    if results.isEmpty && !looking && (trimmed.count >= 2 || mood != nil) {
                        Text(mood != nil && trimmed.isEmpty ? "Nothing in that mood on your services right now." : "Nothing found for “\(trimmed)”.")
                            .font(.sora(15)).foregroundStyle(Theme.muted)
                            .padding(.horizontal, IPad.margin)
                    }
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 28) {
                        ForEach(results) { card in
                            Button { router.title = card.ref } label: { WideCard(card: card, width: 280) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, IPad.margin)
                    if next != nil {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
                            .onAppear { Task { await more() } }
                    } else if looking {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                    }
                }
                .padding(.vertical, 24)
            }
            .background(Theme.ink)
            .navigationTitle("Search")
            .searchable(text: $query, placement: .toolbar, prompt: "Films, series, actors, directors")
            .task(id: trimmed) { await search() }
            .task(id: mood) { await discover() }
        }
    }

    private var moods: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(Mood.allCases) { m in
                    Chip(label: m.label, on: mood == m) {
                        mood = mood == m ? nil : m
                        query = ""
                    }
                }
            }
            .padding(.horizontal, IPad.margin)
        }
        .scrollIndicators(.hidden)
    }

    private func search() async {
        guard trimmed.count >= 2 else {
            if mood == nil { results = []; people = []; next = nil }
            return
        }
        mood = nil
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        looking = true
        defer { looking = false }
        if let found = try? await api.search(trimmed), !Task.isCancelled {
            results = found.titles
            next = found.next
            people = found.people.map {
                PersonChip(id: $0.id, name: $0.name, profile: $0.profile,
                           role: $0.knownFor.first ?? ($0.department == "Directing" ? "Director" : nil))
            }
        }
    }

    private func more() async {
        guard let page = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        let asked = trimmed
        guard let found = try? await api.search(asked, page: page), asked == trimmed else { return }
        let seen = Set(results.map(\.id))
        results += found.titles.filter { !seen.contains($0.id) }
        next = found.next
    }

    private func discover() async {
        guard let mood else { return }
        results = []
        people = []
        next = nil
        looking = true
        defer { looking = false }
        if let found = try? await api.discover(mood: mood.rawValue), !Task.isCancelled { results = found }
    }
}
