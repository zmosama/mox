import SwiftUI

/// Shows you follow, then your watchlist.
struct LibraryView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var payload: LibraryPayload?

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 12, alignment: .top)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("My List")
                    .font(.sora(28, .bold, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
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
                    Button { router.title = card.ref } label: { PosterCard(card: card, width: 104) }
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
