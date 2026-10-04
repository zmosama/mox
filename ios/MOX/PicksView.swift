import SwiftUI

/// What the taste model recommends, built overnight on the server.
///
/// Nothing is computed here or on opening: the list is read as it is, so the
/// tab opens as fast as any other. A pick you have already seen goes from its
/// title page — mark it seen and it is gone now, and it teaches the model.
struct PicksView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var picks: [Card]?
    @Environment(\.horizontalSizeClass) private var size

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Picks")
                        .font(.sora(28, .bold, relativeTo: .title))
                        .foregroundStyle(Theme.paper)
                    Text("Chosen from what you rated, on the services you have. Refreshed every night.")
                        .font(.sora(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                if api.user == nil {
                    SignInPrompt(text: "Sign in and rate a few titles, and picks for you appear here.") { router.settings = true }
                } else if let picks {
                    if picks.isEmpty {
                        Text("Rate at least ten titles and tonight's refresh will choose some for you.")
                            .font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                    }
                    if size == .regular {
                        // Wide pictures with why each was chosen, as the TV app's shelves.
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 20, alignment: .top)], alignment: .leading, spacing: 28) {
                            ForEach(picks) { card in
                                Button { router.title = card.ref } label: { WideCard(card: card, width: 280) }.buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, IPad.margin)
                    } else {
                        LazyVStack(spacing: 14) {
                            ForEach(picks) { card in row(card) }
                        }
                        .padding(.horizontal, 20)
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

    private func row(_ card: Card) -> some View {
        Button { router.title = card.ref } label: {
            HStack(alignment: .top, spacing: 14) {
                RemoteImage(url: card.poster)
                    .frame(width: 84, height: 126)
                    .clipShape(.rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 6) {
                    Text(card.title)
                        .font(.sora(16, .semibold, relativeTo: .headline))
                        .foregroundStyle(Theme.paper)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text([card.year.map(String.init), card.kind == "tv" ? "Series" : "Film",
                          card.rating.map { "★ \($0)" }].compactMap { $0 }.joined(separator: " · "))
                        .font(.sora(13, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                    if let reason = card.reason {
                        Text(reason)
                            .font(.sora(13, .medium, relativeTo: .footnote))
                            .foregroundStyle(Theme.green)
                    }
                    if !card.platforms.isEmpty { FlowChips(platforms: card.platforms) }
                }
                Spacer(minLength: 0)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        if api.user == nil { await api.refreshUser() }
        picks = (try? await api.picks().picks) ?? picks ?? []
    }
}
