import SafariServices
import SwiftUI

nonisolated struct NewsUpdate: Codable, Hashable, Sendable {
    let kind: String
    let tmdbId: Int
    let mediaKind: String
    let title: String
    let image: String?
    let text: String
    let date: String

    var ref: TitleRef { TitleRef(tmdbId: tmdbId, kind: mediaKind) }
}

nonisolated struct Story: Codable, Hashable, Sendable, Identifiable {
    let url: String
    let source: String
    let lang: String
    let title: String
    let summary: String?
    let image: String?
    let publishedAt: Double
    let reasons: [String]

    var id: String { url }
}

nonisolated struct NewsPayload: Codable, Sendable {
    let updates: [NewsUpdate]
    let forYou: [Story]
    let headlines: [Story]
    let langs: [String]
}

/// The News tab: your updates from mox's own data, stories about what you care
/// for — each saying why it is here — then the day's headlines. The web's
/// /news, the same order.
struct NewsView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var payload: NewsPayload?
    @State private var loadError: String?
    @State private var lang = "all"
    @State private var reading: URL?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("News")
                    .font(.sora(28, .bold, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                if let payload {
                    content(payload)
                } else if let loadError {
                    Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .refreshable { await load() }
        .task(id: api.revision) { await load() }
        .sheet(item: $reading) { SafariView(url: $0).ignoresSafeArea() }
    }

    @ViewBuilder
    private func content(_ p: NewsPayload) -> some View {
        if !p.updates.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Your updates")
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 12) {
                        ForEach(p.updates, id: \.self) { u in
                            Button { router.title = u.ref } label: { UpdateCard(update: u) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
            }
        }

        if !p.forYou.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "For you")
                stories(p.forYou)
            }
        }

        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Headlines")
            if p.langs.count > 1 {
                Picker("Language", selection: $lang) {
                    Text("All").tag("all")
                    Text("English").tag("en")
                    Text("عربي").tag("ar")
                }
                .pickerStyle(.segmented)
                .pickerWidth()
                .padding(.horizontal, 20)
            }
            let shown = lang == "all" ? p.headlines : p.headlines.filter { $0.lang == lang }
            if shown.isEmpty {
                Text("Nothing new from the newsrooms yet today.")
                    .font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
            }
            stories(shown)
            if api.user == nil {
                Text("Sign in and the stories about what you follow and love come first, with your own updates above them.")
                    .font(.sora(12.5)).foregroundStyle(Theme.faint).padding(.horizontal, 20)
            }
        }
    }

    private func stories(_ list: [Story]) -> some View {
        Rows(spacing: 10, minWidth: 380) {
            ForEach(list) { story in
                Button { reading = URL(string: story.url) } label: { StoryRow(story: story) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
    }

    private func load() async {
        do {
            payload = try await api.news()
            loadError = nil
        } catch {
            if payload == nil { loadError = error.localizedDescription }
        }
    }
}

private struct UpdateCard: View {
    let update: NewsUpdate

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .frame(width: 250, height: 140)
                .overlay { RemoteImage(url: update.image) }
                .clipped()
                .overlay(alignment: .topLeading) {
                    Text(update.kind == "premiere" ? "Premiere" : update.kind == "arrival" ? "Arrived" : "New")
                        .font(.sora(10.5, .semibold))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(.black.opacity(0.65), in: .capsule)
                        .foregroundStyle(Theme.mint)
                        .padding(8)
                }
            VStack(alignment: .leading, spacing: 3) {
                Text(update.title).font(.sora(14.5, .semibold)).foregroundStyle(Theme.paper).lineLimit(1)
                Text(update.text).font(.sora(12.5)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .padding(12)
        }
        .frame(width: 250, alignment: .leading)
        .background(Theme.surface)
        .clipShape(.rect(cornerRadius: 18))
    }
}

private struct StoryRow: View {
    let story: Story

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Color.clear
                .frame(width: 108, height: 81)
                .overlay { RemoteImage(url: story.image) }
                .clipShape(.rect(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 6) {
                Text(story.title)
                    .font(.sora(14.5, .semibold, relativeTo: .subheadline))
                    .foregroundStyle(Theme.paper)
                    .lineLimit(3)
                    // Leading is the right-hand edge for an Arabic story: the row is laid out right to left.
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(story.source) · \(Self.ago(story.publishedAt))")
                    .font(.sora(12, relativeTo: .caption))
                    .foregroundStyle(Theme.faint)
                if let reason = story.reasons.first {
                    Text(reason).font(.sora(12, .medium, relativeTo: .caption)).foregroundStyle(Theme.mint).lineLimit(1)
                }
            }
        }
        .padding(12)
        .background(Theme.surface, in: .rect(cornerRadius: 18))
        .environment(\.layoutDirection, story.lang == "ar" ? .rightToLeft : .leftToRight)
    }

    /// "12m", "3h", "yesterday", "3 days".
    static func ago(_ unix: Double) -> String {
        let minutes = max(1, Int((Date.now.timeIntervalSince1970 - unix) / 60))
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        return days == 1 ? "yesterday" : "\(days) days"
    }
}

/// A story opens in the app, not in Safari: reading one should not mean leaving MOX.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
