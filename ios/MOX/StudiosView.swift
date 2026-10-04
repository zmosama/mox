import SwiftUI

/// Disney, A24, HBO… most important first. Each opens what it made.
struct StudiosView: View {
    @Environment(API.self) private var api
    @State private var studios: [Studio]?
    @State private var failed = false

    @Environment(\.horizontalSizeClass) private var size
    // Logo tiles: two across a phone, five or six across an iPad.
    private var columns: [GridItem] { [GridItem(.adaptive(minimum: size == .regular ? 190 : 150), spacing: 12)] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Studios")
                            .font(.sora(28, .bold, relativeTo: .title))
                            .foregroundStyle(Theme.paper)
                        Text("What each one made — the most popular, the best rated or the newest. Follow one and it moves to the top.")
                            .font(.sora(14, relativeTo: .subheadline))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.top, 12)

                    if let studios {
                        let mine = studios.filter { $0.following == true }
                        if !mine.isEmpty {
                            Text("Following").font(.sora(20, .semibold, relativeTo: .title3)).foregroundStyle(Theme.paper)
                            grid(mine)
                            Text("All studios").font(.sora(20, .semibold, relativeTo: .title3)).foregroundStyle(Theme.paper)
                                .padding(.top, 8)
                        }
                        grid(studios.filter { $0.following != true })
                    } else if failed {
                        Text("Can't reach the MOX server.").font(.sora(14)).foregroundStyle(Theme.muted)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
            }
            .background(Theme.ink)
            .navigationDestination(for: Studio.self) { StudioView(studio: $0) }
            .task(id: api.revision) { await load() }
            .refreshable { await load() }
        }
    }

    private func grid(_ list: [Studio]) -> some View {
        LazyVGrid(columns: columns, spacing: 14) {
            ForEach(list) { studio in
                NavigationLink(value: studio) { tile(studio) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func tile(_ studio: Studio) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // TMDB's logos are mostly dark lines on nothing: a light tile keeps them legible.
            Color(hex: 0xF2F2EE)
                .frame(height: 92)
                .overlay { LogoImage(url: studio.logo).padding(14) }
                .clipShape(.rect(cornerRadius: 12))
            Text(studio.name)
                .font(.sora(13, .medium, relativeTo: .subheadline))
                .foregroundStyle(Theme.paper)
                .lineLimit(1)
        }
    }

    private func load() async {
        do {
            studios = try await api.studios()
            failed = false
        } catch is CancellationError {
        } catch {
            failed = studios == nil
        }
    }
}

/// One studio's films or series, ten at a time as you scroll.
struct StudioView: View {
    let studio: Studio
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var kind = ""
    @State private var sort = "popular"
    @State private var cards: [Card] = []
    @State private var next: Int?
    @State private var loaded = false
    @State private var loadingMore = false
    @State private var following: Bool?

    private static let sorts = [("popular", "Most popular"), ("top", "Top rated"), ("newest", "Newest")]
    @Environment(\.horizontalSizeClass) private var size
    private var columns: [GridItem] { [GridItem(.adaptive(minimum: PosterSize.grid(size)), spacing: 12)] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 14) {
                    Color(hex: 0xF2F2EE)
                        .frame(width: 96, height: 56)
                        .overlay { LogoImage(url: studio.logo).padding(8) }
                        .clipShape(.rect(cornerRadius: 10))
                    Text(studio.name)
                        .font(.sora(24, .bold, relativeTo: .title))
                        .foregroundStyle(Theme.paper)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 0)
                }

                // Following moves it to the top of Studios.
                let on = following ?? studio.following ?? false
                Button {
                    Task { await toggleFollow(!on) }
                } label: {
                    Label(on ? "Following" : "Follow", systemImage: on ? "checkmark" : "plus")
                        .font(.sora(14, .semibold))
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(on ? Theme.green.opacity(0.2) : Theme.green, in: .capsule)
                        .foregroundStyle(on ? Theme.green : Theme.ink)
                }
                .buttonStyle(.plain)

                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        if studio.kinds.count > 1 {
                            ForEach(studio.kinds, id: \.self) { k in
                                Chip(label: k == "movie" ? "Films" : "Series", on: kind == k) { kind = k }
                            }
                            Divider().frame(height: 20)
                        }
                        ForEach(Self.sorts, id: \.0) { id, label in
                            Chip(label: label, on: sort == id) { sort = id }
                        }
                    }
                }
                .scrollIndicators(.hidden)

                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if cards.isEmpty {
                    Text("Nothing here yet.").font(.sora(14)).foregroundStyle(Theme.muted)
                } else {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                        ForEach(cards) { card in
                            Button { router.title = card.ref } label: {
                                PosterCard(card: card, width: PosterSize.grid(size))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if next != nil {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 20)
                            .onAppear { Task { await more() } }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(kind)|\(sort)") { await first() }
    }

    private func toggleFollow(_ on: Bool) async {
        guard api.user != nil else { router.settings = true; return }
        following = on
        do { try await api.setFollowing(studio: studio.slug, on) } catch { following = !on }
    }

    private func first() async {
        if kind.isEmpty { kind = studio.kinds.first ?? "movie"; return }
        loaded = false
        guard let page = try? await api.studio(studio.slug, kind: kind, sort: sort, page: 1), !Task.isCancelled else {
            loaded = true
            return
        }
        cards = page.results
        next = page.next
        loaded = true
    }

    private func more() async {
        guard let page = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        let asked = (kind, sort)
        guard let got = try? await api.studio(studio.slug, kind: kind, sort: sort, page: page), asked == (kind, sort) else { return }
        let seen = Set(cards.map(\.id))
        cards += got.results.filter { !seen.contains($0.id) }
        next = got.next
    }
}

/// A logo fitted inside whatever space it is given, never larger.
private struct LogoImage: View {
    let url: String

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            if let image = phase.image { image.resizable().scaledToFit() } else { Color.clear }
        }
    }
}

/// A round choice, filled when chosen.
struct Chip: View {
    let label: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.sora(13, .medium, relativeTo: .subheadline))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(on ? Theme.green : Theme.surface, in: .capsule)
                .foregroundStyle(on ? Theme.ink : Theme.paper)
        }
        .buttonStyle(.plain)
    }
}
