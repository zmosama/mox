import SwiftUI

/// A film or series: where to watch it, and what you think of it.
struct TitleSheet: View {
    let ref: TitleRef
    @Environment(API.self) private var api
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    @State private var detail: TitleDetail?
    @State private var loadError: String?
    @State private var verdict: String?
    @State private var following = false
    @State private var signingIn = false
    @State private var person: PersonRef?
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// On an iPad the title opens as a large card over the screen: a taller
    /// picture across the top, the name large over it, wider margins.
    private var wide: Bool { sizeClass == .regular }
    private var pad: CGFloat { wide ? IPad.margin : 20 }

    var body: some View {
        ScrollView {
            if let detail {
                content(detail)
            } else if let loadError {
                Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted).padding(40)
            } else {
                ProgressView().padding(.top, 120)
            }
        }
        .scrollIndicators(.hidden)
        .background(Theme.ink)
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.paper)
                    .glassCircle(36)
            }
            .buttonStyle(.plain)
            .padding(16)
            .accessibilityLabel("Close")
        }
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $signingIn) { SettingsView() }
        .sheet(item: $person) { PersonSheet(id: $0.id) }
        .task { await load() }
    }

    private func content(_ d: TitleDetail) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            ZStack(alignment: .bottomLeading) {
                /* The picture fills a box the width of the sheet rather than
                   sizing it: a filled image reports its own, wider width, which
                   widened the whole column and pushed every line of text to
                   the screen's edges. */
                Color.clear
                    .frame(height: wide ? 440 : 260)
                    .frame(maxWidth: .infinity)
                    .overlay { RemoteImage(url: d.backdrop ?? d.poster) }
                    .clipped()
                LinearGradient(colors: [.clear, Theme.ink], startPoint: .center, endPoint: .bottom)
                if wide {
                    LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .leading, endPoint: .center)
                }
                VStack(alignment: .leading, spacing: wide ? 10 : 6) {
                    Text(d.title)
                        .font(.sora(wide ? 40 : 28, .bold, relativeTo: .largeTitle))
                        .foregroundStyle(Theme.paper)
                    Text(meta(d))
                        .font(.sora(wide ? 16 : 13, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, pad)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text(d.platforms.isEmpty ? "Not on your services in Egypt" : "Watch on")
                    .font(.sora(13, .semibold, relativeTo: .footnote))
                    .foregroundStyle(Theme.muted)
                ForEach(d.platforms, id: \.name) { p in
                    Button {
                        if let s = p.url, let url = URL(string: s) { openURL(url) }
                    } label: {
                        HStack(spacing: 12) {
                            if let logo = p.logo {
                                RemoteImage(url: logo).frame(width: 30, height: 30).clipShape(.rect(cornerRadius: 7))
                            }
                            Text(p.name).font(.sora(16, .semibold)).foregroundStyle(Theme.paper)
                            Spacer()
                            Image(systemName: "play.fill").foregroundStyle(Theme.green)
                        }
                        .padding(12)
                        .background(Theme.raised, in: .rect(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: wide ? 560 : .infinity, alignment: .leading)
            .padding(.horizontal, pad)

            // Always shown: hidden when signed out, they looked missing rather
            // than locked. Signed out, any of them opens sign-in.
            actions(d)
            if api.user == nil {
                Button("Sign in to rate this, follow it or add it to your list.") { signingIn = true }
                    .font(.sora(13))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, pad)
            }

            if let friends = d.friends, !friends.isEmpty {
                FriendsOnTitle(friends: friends).padding(.horizontal, pad)
            }
            if let tagline = d.tagline {
                Text(tagline).font(.sora(15, .medium)).italic().foregroundStyle(Theme.mint).padding(.horizontal, pad)
            }
            if let overview = d.overview {
                Text(overview)
                    .font(.sora(wide ? 17 : 15, relativeTo: .body))
                    .foregroundStyle(Theme.paper.opacity(0.85))
                    .lineSpacing(4)
                    .frame(maxWidth: wide ? 760 : .infinity, alignment: .leading)
                    .padding(.horizontal, pad)
            }
            if d.kind == "tv", let progress = d.progress {
                EpisodesSection(tmdbId: d.tmdbId, progress: progress) { signingIn = true }
                    .padding(.horizontal, pad)
            }
            // Faces that open each person's page; names only when the server is older.
            if let people = d.people, !people.isEmpty {
                PeopleRow(title: "Cast & crew", people: people, size: 68) { person = PersonRef(id: $0) }
            } else {
                if !d.cast.isEmpty {
                    credit("Starring", d.cast.joined(separator: ", "))
                }
                if !d.directors.isEmpty {
                    credit("By", d.directors.joined(separator: ", "))
                }
            }
            if let trailer = d.trailer, let url = URL(string: trailer) {
                Button { openURL(url) } label: { Label("Watch the trailer", systemImage: "play.rectangle") }
                    .buttonStyle(.glass)
                    .padding(.horizontal, pad)
            }
        }
        .padding(.bottom, 40)
    }

    private func actions(_ d: TitleDetail) -> some View {
        WrapLayout(spacing: 10) {
            if d.kind == "tv" {
                toggle(following ? "Following" : "Follow", following ? "bookmark.fill" : "bookmark", on: following) {
                    guard api.user != nil else { signingIn = true; return }
                    following.toggle()
                    let value = following
                    Task { try? await api.setFollowing(d.tmdbId, value) }
                }
            }
            // Added shows as a tick, so it is plain whether it is on your list.
            toggle(verdict == "watchlist" ? "In Watchlist" : "Watchlist",
                   verdict == "watchlist" ? "checkmark.circle.fill" : "plus.circle", on: verdict == "watchlist") {
                set(verdict == "watchlist" ? nil : "watchlist")
            }
            // An eye, so its mark is not mistaken for the watchlist's tick;
            // the words change too, so it never rests on colour alone.
            toggle(verdict == "seen" ? "Watched" : "Mark as seen",
                   verdict == "seen" ? "eye.circle.fill" : "eye", on: verdict == "seen") {
                set(verdict == "seen" ? nil : "seen")
            }
            if api.user == nil {
                Button { signingIn = true } label: {
                    Image(systemName: icon(for: nil))
                        .frame(width: 44, height: 44)
                        .background(Theme.surface, in: .circle)
                        .foregroundStyle(Theme.paper)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Rate")
            } else {
            Menu {
                Button("Loved it", systemImage: "heart.fill") { set("love") }
                Button("Liked it", systemImage: "hand.thumbsup") { set("like") }
                Button("Not for me", systemImage: "hand.thumbsdown") { set("dislike") }
                Button("Hide it", systemImage: "eye.slash") { set("hidden") }
                if verdict != nil { Button("Clear", role: .destructive) { set(nil) } }
            } label: {
                Image(systemName: icon(for: verdict))
                    .frame(width: 44, height: 44)
                    .background(Theme.surface, in: .circle)
                    .foregroundStyle(["love", "like"].contains(verdict ?? "") ? Theme.green : Theme.paper)
            }
            .accessibilityLabel("Rate")
            }

            // A mox link to this title, to send as a recommendation. Always the
            // public site, whatever server a development build is pointed at.
            ShareLink(
                item: AppSettings.publicSite.appending(path: "title/\(d.kind)/\(d.tmdbId)"),
                subject: Text(d.title),
                message: Text(d.platforms.first.map { "\(d.title) — watch it on \($0.name)" } ?? d.title)
            ) {
                Label("Share", systemImage: "square.and.arrow.up")
                    .font(.sora(13, .medium))
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .background(Theme.surface, in: .capsule)
                    .foregroundStyle(Theme.paper)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, pad)
    }

    private func toggle(_ title: String, _ icon: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.sora(13, .medium))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .background(on ? Theme.green.opacity(0.22) : Theme.surface, in: .capsule)
                .foregroundStyle(on ? Theme.green : Theme.paper)
        }
        .buttonStyle(.plain)
    }

    /// The rating button shows your rating, or an empty thumb inviting one.
    /// Hidden, seen and watchlist are not ratings, so they leave it empty.
    private func icon(for verdict: String?) -> String {
        switch verdict {
        case "love": "heart.fill"
        case "like": "hand.thumbsup.fill"
        case "dislike": "hand.thumbsdown.fill"
        default: "hand.thumbsup"
        }
    }

    private func credit(_ label: String, _ names: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.sora(12, .semibold)).foregroundStyle(Theme.muted)
            Text(names).font(.sora(14)).foregroundStyle(Theme.paper)
        }
        .padding(.horizontal, pad)
    }

    private func meta(_ d: TitleDetail) -> String {
        var parts: [String] = []
        if let when = Self.releaseFact(d) { parts.append(when) }
        if d.kind == "tv", let s = d.seasons {
            parts.append(s == 1 ? "1 season" : "\(s) seasons")
            if let n = d.progress?.totalEpisodes, n > 0 { parts.append("\(n) episodes") }
        }
        else if let r = d.runtime, r > 0 { parts.append("\(r / 60 > 0 ? "\(r / 60)h " : "")\(r % 60)m") }
        if let age = d.age { parts.append(age) }
        parts.append(contentsOf: d.genres.prefix(2))
        if let rating = d.rating { parts.append("★ \(String(format: "%.1f", rating))") }
        if let imdb = d.imdb { parts.append("IMDb \(String(format: "%.1f", imdb.rating))") }
        return parts.joined(separator: " · ")
    }

    /// When it comes out, said the useful way: a film's full date ("12 Nov
    /// 2026", or "Coming 12 Nov 2026"), a series' year, or when it premieres.
    static func releaseFact(_ d: TitleDetail) -> String? {
        guard let s = d.releaseDate, let date = Day.date(s) else { return d.year.map(String.init) }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.timeZone = Day.zone
        f.dateFormat = "d MMM yyyy"
        let full = f.string(from: date)
        let future = s > Day.todayISO
        if d.kind == "movie" { return future ? "Coming \(full)" : full }
        return future ? "Premieres \(full)" : String(s.prefix(4))
    }

    private func set(_ value: String?) {
        guard api.user != nil else { signingIn = true; return }
        verdict = value
        Task { try? await api.setVerdict(ref, value) }
    }

    private func load() async {
        do {
            let d = try await api.title(ref)
            detail = d
            verdict = d.verdict
            following = d.following
        } catch {
            loadError = error.localizedDescription
        }
    }
}
