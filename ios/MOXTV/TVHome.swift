import SwiftUI

/// Home on the television: rows of posters to move through with the remote,
/// and above them whatever is in focus, large — the way tvOS shows a shelf.
struct TVHome: View {
    @Environment(API.self) private var api
    @State private var home: HomePayload?
    @State private var library: LibraryPayload?
    @State private var focused: Card?
    @State private var path = NavigationPath()
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
                            TVRow(title: row.title, detail: row.detail, cards: row.cards, focused: $focused,
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
            .tvDestinations()
        }
        .task(id: api.revision) { await load() }
        .alert("MOX", isPresented: .init(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") {}
        } message: {
            Text(notice ?? "")
        }
    }

    private struct Row { let title: String; var detail: String? = nil; let cards: [Card] }

    /// What he opens the television for, first — tonight's episodes and what
    /// he saved — then the phone's Home, in the phone's words.
    private var rows: [Row] {
        [
            Row(title: "New for you", cards: home?.forYou ?? []),
            Row(title: "Watchlist", cards: library?.watchlist ?? []),
            Row(title: "Picked for you", detail: "from your ratings", cards: home?.picks ?? []),
            Row(title: "Just landed", detail: "on your services", cards: home?.fresh ?? []),
            Row(title: "Everyone's watching", detail: "this week", cards: home?.trending ?? []),
            Row(title: "Coming soon", detail: "most anticipated", cards: home?.coming ?? []),
            Row(title: "From people you follow", cards: (home?.fromPeople ?? []).map(\.title)),
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
        guard link.landing != .appOnly, link.landing != .none, await link.open() else {
            path.append(card.ref)
            return
        }
    }
}
