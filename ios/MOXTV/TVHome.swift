import SwiftUI

/// Home on the television: rows of posters to move through with the remote,
/// and above them whatever is in focus, large — the way tvOS shows a shelf.
struct TVHome: View {
    @Environment(API.self) private var api
    @State private var home: HomePayload?
    @State private var library: LibraryPayload?
    @State private var focused: Card?
    @State private var path: [TitleRef] = []
    @State private var problem: String?
    @State private var notice: String?
    @State private var opened = false

    var body: some View {
        NavigationStack(path: $path) {
            ZStack(alignment: .top) {
                TVBackdrop(card: focused)
                ScrollView {
                    VStack(alignment: .leading, spacing: 44) {
                        TVSpotlight(card: focused)
                            .frame(height: 430, alignment: .bottomLeading)
                            .padding(.horizontal, TV.edge)
                        ForEach(rows, id: \.title) { row in
                            TVRow(title: row.title, cards: row.cards, focused: $focused,
                                  open: { path.append($0.ref) },
                                  play: { card in Task { await play(card) } })
                        }
                        if let problem, rows.isEmpty {
                            Text(problem).font(.system(size: 28)).foregroundStyle(.orange)
                                .padding(.horizontal, TV.edge)
                        }
                        account
                    }
                    .padding(.bottom, 80)
                }
                .scrollClipDisabled()
            }
            .ignoresSafeArea(edges: .horizontal)
            .navigationDestination(for: TitleRef.self) { TVTitle(ref: $0) }
        }
        .task(id: api.revision) { await load() }
        .alert("MOX", isPresented: .init(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") {}
        } message: {
            Text(notice ?? "")
        }
    }

    private struct Row { let title: String; let cards: [Card] }

    /// What he opens the television for, first: tonight's episodes, then what
    /// he saved, then what MOX would pick for him.
    private var rows: [Row] {
        [
            Row(title: "New episodes", cards: home?.forYou ?? []),
            Row(title: "Watchlist", cards: library?.watchlist ?? []),
            Row(title: "Picks for you", cards: home?.picks ?? []),
            Row(title: "New on your services", cards: home?.fresh ?? []),
            Row(title: "Shows you follow", cards: library?.following ?? []),
        ].filter { !$0.cards.isEmpty }
    }

    private var account: some View {
        HStack(spacing: 24) {
            if let user = api.user {
                Text("Signed in as \(user.name)")
                    .font(.system(size: 25))
                    .foregroundStyle(TV.muted)
            }
            Button("Sign out") { Task { await api.signOut() } }
                .font(.system(size: 25))
        }
        .padding(.horizontal, TV.edge)
        .padding(.top, 20)
        .focusSection()
    }

    private func load() async {
        // What the screen showed last time, at once; the fresh copy replaces it.
        if home == nil { home = api.peek("/api/app/home") }
        if library == nil { library = api.peek("/api/app/library") }
        do {
            async let h = api.home()
            async let l = api.library()
            let (newHome, newLibrary) = try await (h, l)
            home = newHome
            library = newLibrary
            problem = nil
        } catch {
            problem = "Can't reach MOX: \(error.localizedDescription)"
        }
        if focused == nil { focused = rows.first?.cards.first }
        // `-tvOpen tv/1234` opens straight on a title: for checking that page
        // in the simulator, which has no remote to press.
        if !opened, let ask = UserDefaults.standard.string(forKey: "tvOpen") {
            opened = true
            let parts = ask.split(separator: "/")
            if parts.count == 2, let id = Int(parts[1]) { path.append(TitleRef(tmdbId: id, kind: String(parts[0]))) }
        }
    }

    /// Play/Pause on a poster: skip the title page and go to the app.
    private func play(_ card: Card) async {
        guard let detail = try? await api.title(card.ref), let platform = detail.platforms.first else {
            path.append(card.ref)
            return
        }
        let link = TVLink.target(for: platform)
        guard link.landing == .title || link.landing == .plays, await link.open() else {
            path.append(card.ref)
            return
        }
    }
}

/// The picture behind everything: the focused title's, dimmed towards the rows.
private struct TVBackdrop: View {
    let card: Card?

    var body: some View {
        GeometryReader { geo in
            ZStack {
                TV.ink
                if let card {
                    TVImage(path: wide(card.backdrop) ?? card.poster)
                        .frame(width: geo.size.width, height: geo.size.height * 0.78)
                        .clipped()
                        .frame(maxHeight: .infinity, alignment: .top)
                        .id(card.id)
                        .transition(.opacity)
                }
                LinearGradient(stops: [
                    .init(color: TV.ink.opacity(0.92), location: 0),
                    .init(color: TV.ink.opacity(0.35), location: 0.55),
                    .init(color: .clear, location: 1),
                ], startPoint: .leading, endPoint: .trailing)
                LinearGradient(stops: [
                    .init(color: .clear, location: 0.25),
                    .init(color: TV.ink, location: 0.74),
                ], startPoint: .top, endPoint: .bottom)
            }
            .animation(.easeInOut(duration: 0.35), value: card?.id)
        }
        .ignoresSafeArea()
    }

    /// TMDB's larger file for a screen this size.
    private func wide(_ url: String?) -> String? {
        url?.replacingOccurrences(of: "/t/p/w780/", with: "/t/p/w1280/")
    }
}

/// The focused title in words: name, what is new about it, where it plays.
private struct TVSpotlight: View {
    let card: Card?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let card {
                Text(card.title)
                    .font(.system(size: 66, weight: .bold))
                    .foregroundStyle(TV.paper)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                HStack(spacing: 16) {
                    if let label = card.episodeLabel ?? card.releaseLabel {
                        Text(label).foregroundStyle(TV.green).fontWeight(.semibold)
                    }
                    if let year = card.year { Text(String(year)) }
                    if let rating = card.rating, rating > 0 { Text("★ " + String(format: "%.1f", rating)) }
                    if !card.platforms.isEmpty { Text(card.platforms.map(\.name).joined(separator: " · ")) }
                }
                .font(.system(size: 28))
                .foregroundStyle(TV.muted)
                if let text = card.reason ?? card.overview {
                    Text(text)
                        .font(.system(size: 27))
                        .foregroundStyle(TV.paper.opacity(0.82))
                        .lineLimit(3)
                        .frame(maxWidth: 900, alignment: .leading)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.2), value: card?.id)
    }
}

/// One shelf. Posters are buttons, so the focus engine lifts the one in
/// focus and the remote's swipe moves along the row.
private struct TVRow: View {
    let title: String
    let cards: [Card]
    @Binding var focused: Card?
    let open: (Card) -> Void
    let play: (Card) -> Void
    @FocusState private var focus: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(TV.paper)
                .padding(.horizontal, TV.edge)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 36) {
                    ForEach(cards) { card in
                        Button { open(card) } label: {
                            TVImage(path: card.poster)
                                .frame(width: 220, height: 330)
                        }
                        .buttonStyle(.card)
                        .focused($focus, equals: card.id)
                        .onPlayPauseCommand { play(card) }
                        .accessibilityLabel(card.title)
                    }
                }
                .padding(.horizontal, TV.edge)
                .padding(.vertical, 30)
            }
            .scrollClipDisabled()
        }
        .focusSection()
        .onChange(of: focus) { _, id in
            if let card = cards.first(where: { $0.id == id }) { focused = card }
        }
    }
}
