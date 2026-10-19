import SwiftUI

// The iPad's own screens, after the Apple TV app: a featured title across the
// top of Home, shelves of wide pictures rather than posters, Search as a place
// of its own in the sidebar, and titles that grow out of their card. On an iPhone
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
                .opensTitle(card.ref)
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

// MARK: - Opening a title

/// The namespace titles open from: a card marks itself as the source, and the
/// title's page grows out of it and shrinks back into it — Netflix's card, and
/// MOX's own on the website. Set only on an iPad.
private struct CardNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    var cardNamespace: Namespace.ID? {
        get { self[CardNamespaceKey.self] }
        set { self[CardNamespaceKey.self] = newValue }
    }
}

private struct OpensTitle: ViewModifier {
    let id: String
    @Environment(\.cardNamespace) private var ns

    func body(content: Content) -> some View {
        if let ns {
            content.matchedTransitionSource(id: id, in: ns) { $0.clipShape(.rect(cornerRadius: 14)) }
        } else {
            content
        }
    }
}

extension View {
    /// Where a title opens from, for the iPad's zoom into its page.
    func opensTitle(_ ref: TitleRef) -> some View { modifier(OpensTitle(id: ref.id)) }
}

// MARK: - Featured

/// The top of Home: the week's biggest titles as a carousel, behaving as the
/// website's does. The current picture sits in the middle with its
/// neighbours dimmed at either side; it goes round in both directions — the
/// slides are laid out three times over, the middle set is the one shown, and
/// once scrolling comes to rest in the first or last set it is moved, unseen,
/// to the same slide in the middle — so the last slide is followed by the
/// first, never a rewind through all of them. It moves on by itself every
/// seven seconds, and holds still while a finger is on it.
struct FeaturedCarousel: View {
    let cards: [Card]
    let open: (TitleRef) -> Void
    /// Which slide is centred, counted across all three sets.
    @State private var at: Int?
    @State private var width: CGFloat = 900
    /// A finger on it, or it still gliding: no moving on by itself.
    @State private var touching = false

    /// No taller than this: a wider space shows more of the neighbours instead.
    private let maxHeight: CGFloat = 460

    private var n: Int { cards.count }
    private var looped: [Card] { n > 1 ? cards + cards + cards : cards }
    private var home: Int { n > 1 ? n : 0 }
    private var current: Int { at ?? home }
    private var slideWidth: CGFloat { min(width - 128, maxHeight * 16 / 9) }

    var body: some View {
        VStack(spacing: 14) {
            ScrollView(.horizontal) {
                HStack(spacing: 16) {
                    ForEach(Array(looped.enumerated()), id: \.offset) { i, card in
                        slide(card, rank: i % max(n, 1) + 1)
                            .frame(width: slideWidth)
                            // By the picture, not the copy, so the jump back to
                            // the middle set does not dim and relight it.
                            .opacity(i % max(n, 1) == current % max(n, 1) ? 1 : 0.4)
                            .animation(.easeOut(duration: 0.4), value: current)
                            .id(i)
                    }
                }
                .scrollTargetLayout()
            }
            // Centred: the margins either side are what is left of the width.
            .contentMargins(.horizontal, max(0, (width - slideWidth) / 2), for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .scrollPosition(id: $at, anchor: .center)
            .onScrollPhaseChange { _, phase in
                touching = phase != .idle
                guard phase == .idle, n > 1 else { return }
                // Come to rest outside the middle set: back into it, unseen.
                if current < n || current >= 2 * n {
                    var quiet = Transaction()
                    quiet.disablesAnimations = true
                    withTransaction(quiet) { at = current % n + n }
                }
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .onAppear { if at == nil { at = home } }

            if n > 1 {
                HStack(spacing: 8) {
                    ForEach(cards.indices, id: \.self) { i in
                        Button {
                            withAnimation(.smooth) { at = n + i }
                        } label: {
                            Capsule()
                                .fill(Theme.paper.opacity(current % n == i ? 1 : 0.3))
                                .frame(width: current % n == i ? 20 : 7, height: 7)
                                .padding(.vertical, 6)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Show \(cards[i].title)")
                    }
                }
                .animation(.smooth, value: current)
            }
        }
        .task(id: "\(current)|\(touching)") {
            guard !touching, n > 1 else { return }
            try? await Task.sleep(for: .seconds(7))
            guard !Task.isCancelled, !touching else { return }
            // From the middle set, so the next slide always exists: even if the
            // last glide never reported coming to rest, this cannot run off the end.
            let from = current % n + n
            if from != current {
                var quiet = Transaction()
                quiet.disablesAnimations = true
                withTransaction(quiet) { at = from }
            }
            withAnimation(.smooth(duration: 0.6)) { at = from + 1 }
        }
    }

    /// TMDB's larger picture for the same file: w780 was soft at this size.
    private func sharp(_ url: String?) -> String? {
        url?.replacingOccurrences(of: #"/w\d+/"#, with: "/w1280/", options: .regularExpression)
    }

    private func slide(_ card: Card, rank: Int) -> some View {
        ZStack(alignment: .bottomLeading) {
            Color.clear
                .overlay { RemoteImage(url: sharp(card.backdrop ?? card.poster)) }
                .clipped()
            LinearGradient(colors: [.black.opacity(0.9), .black.opacity(0.25), .clear], startPoint: .bottom, endPoint: .center)
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .leading, endPoint: .center)

            VStack(alignment: .leading, spacing: 10) {
                Text(["#\(rank) this week", card.platforms.first?.name].compactMap { $0 }.joined(separator: " · ").uppercased())
                    .font(.sora(12, .semibold, relativeTo: .caption))
                    .tracking(1.3)
                    .foregroundStyle(Theme.green)
                Text(card.title)
                    .font(.sora(40, .bold, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.paper)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                Text([card.year.map(String.init), card.isTV ? "Series" : "Film",
                      card.rating.map { "★ \(String(format: "%.1f", $0))" }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.sora(14, relativeTo: .subheadline))
                    .foregroundStyle(Theme.paper.opacity(0.8))
                if let overview = card.overview {
                    Text(overview)
                        .font(.sora(14, relativeTo: .body))
                        .foregroundStyle(Theme.paper.opacity(0.75))
                        .lineLimit(2)
                        .frame(maxWidth: 520, alignment: .leading)
                }
                HStack(spacing: 12) {
                    if let p = card.platforms.first, let s = p.url, let url = URL(string: s) {
                        Link(destination: url) {
                            Label("Play", systemImage: "play.fill")
                                .font(.sora(15, .semibold))
                                .padding(.horizontal, 20).padding(.vertical, 11)
                                .background(Theme.paper, in: .capsule)
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    Button { open(card.ref) } label: {
                        Label("Details", systemImage: "info.circle")
                            .font(.sora(15, .semibold))
                            .padding(.horizontal, 20).padding(.vertical, 11)
                            .glassEffect(.regular.interactive(), in: .capsule)
                            .foregroundStyle(Theme.paper)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 4)
            }
            .padding(28)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 28))
        .contentShape(.rect)
        .opensTitle(card.ref)
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
                    if let fresh = payload.fresh, !fresh.isEmpty {
                        WideShelf(title: "Just landed", detail: "on your services", cards: fresh) { router.title = $0 }
                    }
                    if let picks = payload.picks, !picks.isEmpty {
                        WideShelf(title: "Picked for you", detail: "from your ratings", cards: picks) { router.title = $0 }
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
                        WideShelf(title: "Everyone's watching", detail: "this week", cards: payload.trending) { router.title = $0 }
                    }
                    if let coming = payload.coming, !coming.isEmpty {
                        WideShelf(title: "Coming soon", detail: "most anticipated", cards: coming) { router.title = $0 }
                    }
                    AiringSection(episodes: payload.calendar, today: payload.today, signedIn: payload.user != nil)
                        .padding(.horizontal, IPad.margin - 20)
                    ScreenStrip(columns: 4)
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
        .background(Color.black.ignoresSafeArea())
        // Your photo up in the tab bar's row, at the screen's top corner —
        // not down over the pictures.
        .overlay(alignment: .topTrailing) {
            AccountButton()
                .padding(.trailing, 24)
                .padding(.top, 26)
                .ignoresSafeArea(edges: .top)
        }
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

/// A mood as the Browse row shows it: a tall tile with a picture.
nonisolated struct BrowseMood: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let label: String
    let image: String?
}

nonisolated struct BrowsePayload: Codable, Sendable {
    let moods: [BrowseMood]
}

/// Search on an iPad, after the TV app's: the field across the top, then
/// Browse — a tall tile for each mood, and the studios — until something is
/// typed, when the results take their place, ten at a time.
struct IPadSearch: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var query = ""
    @State private var mood: BrowseMood?
    @State private var browse: [BrowseMood] = []
    @State private var studios: [Studio] = []
    @State private var studio: Studio?
    @State private var results: [Card] = []
    @State private var people: [PersonChip] = []
    @State private var next: Int?
    @State private var looking = false
    @State private var loadingMore = false
    @FocusState private var focused: Bool

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }
    private var searching: Bool { trimmed.count >= 2 }
    private let columns = [GridItem(.adaptive(minimum: 280), spacing: 20, alignment: .top)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    field
                    if searching || mood != nil {
                        answers
                    } else {
                        browseRow
                        if !studios.isEmpty { studiosRow }
                    }
                }
                .padding(.vertical, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.ink)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $studio) { StudioView(studio: $0) }
            .task { await loadBrowse() }
            .task(id: trimmed) { await search() }
            .task(id: mood) { await discover() }
        }
    }

    // MARK: Field

    private var field: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").font(.system(size: 18, weight: .medium)).foregroundStyle(Theme.muted)
            TextField("", text: $query, prompt: Text("Films, series, actors and directors").foregroundStyle(Theme.muted))
                .font(.sora(18, relativeTo: .body))
                .foregroundStyle(Theme.paper)
                .focused($focused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onChange(of: query) { if !query.isEmpty { mood = nil } }
            if looking {
                ProgressView().controlSize(.small)
            } else if !query.isEmpty || mood != nil {
                Button {
                    query = ""; mood = nil
                } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 18)).foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear")
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 54)
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(.horizontal, IPad.margin)
    }

    // MARK: Browse

    private var browseRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Browse").font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
                .padding(.horizontal, IPad.margin)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 18) {
                    ForEach(browse) { m in
                        Button { mood = m; focused = false } label: { tile(m) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, IPad.margin)
            }
            .scrollIndicators(.hidden)
        }
    }

    /// Tall, its picture filling it, the mood's name at the bottom — the TV app's genre tile.
    private func tile(_ m: BrowseMood) -> some View {
        Color.clear
            .frame(width: 200, height: 300)
            .overlay { RemoteImage(url: m.image) }
            .overlay {
                LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
            }
            .overlay(alignment: .bottomLeading) {
                Text(m.label)
                    .font(.sora(18, .bold, relativeTo: .headline))
                    .foregroundStyle(.white)
                    .padding(16)
            }
            .clipShape(.rect(cornerRadius: 18))
            .contentShape(.rect)
    }

    private var studiosRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Studios").font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
                .padding(.horizontal, IPad.margin)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 16) {
                    ForEach(studios) { s in
                        Button { studio = s } label: {
                            Color(hex: 0xF2F2EE)
                                .frame(width: 200, height: 112)
                                .overlay {
                                    AsyncImage(url: URL(string: s.logo)) { phase in
                                        if let image = phase.image { image.resizable().scaledToFit() } else { Color.clear }
                                    }
                                    .padding(20)
                                }
                                .clipShape(.rect(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(s.name)
                    }
                }
                .padding(.horizontal, IPad.margin)
            }
            .scrollIndicators(.hidden)
        }
    }

    // MARK: Answers

    @ViewBuilder
    private var answers: some View {
        if !people.isEmpty {
            PeopleRow(title: "People", people: people) { router.person = PersonRef(id: $0) }
        }
        VStack(alignment: .leading, spacing: 16) {
            Text(mood.map(\.label) ?? "Top results")
                .font(.sora(24, .bold, relativeTo: .title2)).foregroundStyle(Theme.paper)
            if results.isEmpty && !looking {
                Text(mood != nil ? "Nothing in that mood on your services right now." : "Nothing found for “\(trimmed)”.")
                    .font(.sora(15)).foregroundStyle(Theme.muted)
            }
            LazyVGrid(columns: columns, alignment: .leading, spacing: 28) {
                ForEach(results) { card in
                    Button { router.title = card.ref } label: { WideCard(card: card, width: 280) }
                        .buttonStyle(.plain)
                }
            }
            if next != nil {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
                    .onAppear { Task { await more() } }
            }
        }
        .padding(.horizontal, IPad.margin)
    }

    // MARK: Loading

    private func loadBrowse() async {
        if browse.isEmpty, let b: BrowsePayload = try? await api.get("/api/app/browse") { browse = b.moods }
        if studios.isEmpty { studios = (try? await api.studios()) ?? [] }
    }

    private func search() async {
        guard searching else {
            if mood == nil { results = []; people = []; next = nil }
            return
        }
        // A short pause between keystrokes: answers now come from our own index.
        try? await Task.sleep(for: .milliseconds(150))
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
        if let found = try? await api.discover(mood: mood.id), !Task.isCancelled { results = found }
    }
}
