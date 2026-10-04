import SwiftUI

/// Shows you follow, then your watchlist.
struct LibraryView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var payload: LibraryPayload?

    @Environment(\.horizontalSizeClass) private var size
    private var columns: [GridItem] { [GridItem(.adaptive(minimum: PosterSize.grid(size)), spacing: 12, alignment: .top)] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack {
                    Text("My List")
                        .font(.sora(28, .bold, relativeTo: .title))
                        .foregroundStyle(Theme.paper)
                    Spacer()
                    // A link anyone can open, with or without the app or an account.
                    if let user = api.user {
                        ShareLink(
                            item: AppSettings.publicSite.appending(path: "u/\(user.username)"),
                            subject: Text("My list on mox"),
                            message: Text("What I'm following and want to watch")
                        ) {
                            Label("Share", systemImage: "square.and.arrow.up")
                                .font(.sora(13, .medium))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .glassEffect(.regular.interactive(), in: .capsule)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                if api.user == nil {
                    SignInPrompt(text: "Sign in to see the shows you follow and your watchlist.") { router.settings = true }
                } else if let payload {
                    grid("Following", payload.following, empty: "Follow a show from its page and it lands here.")
                    if let people = payload.people, !people.isEmpty {
                        PeopleRow(title: "People you follow",
                                  people: people.map { PersonChip(id: $0.id, name: $0.name, profile: $0.profile, role: nil) }) {
                            router.person = PersonRef(id: $0)
                        }
                    }
                    grid("Watchlist", payload.watchlist, empty: "Nothing saved for later yet.")
                    if let loved = payload.loved, !loved.isEmpty {
                        PeopleRow(title: "People you love",
                                  people: loved.map { PersonChip(id: $0.id, name: $0.name, profile: $0.profile,
                                                                 role: $0.seen.map { "In \($0) you rated well" }) }) {
                            router.person = PersonRef(id: $0)
                        }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .refreshable { await load() }
        .task(id: api.revision) { await load() }
    }

    private func grid(_ title: String, _ cards: [Card], empty: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title, detail: cards.isEmpty ? nil : "\(cards.count)")
            if cards.isEmpty {
                Text(empty).font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
            }
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(cards) { card in
                    Button { router.title = card.ref } label: { PosterCard(card: card, width: PosterSize.grid(size)) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func load() async {
        if api.user == nil { await api.refreshUser() }
        payload = try? await api.library()
    }
}
