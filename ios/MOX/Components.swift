import SwiftUI

// MARK: - Dates

/// Day labels read in Cairo time, like the website.
enum Day {
    static let zone = TimeZone(identifier: "Africa/Cairo")!

    private static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let short: DateFormatter = {
        let f = DateFormatter()
        f.timeZone = zone
        f.dateFormat = "EEE d MMM"
        return f
    }()

    static func date(_ s: String) -> Date? { iso.date(from: String(s.prefix(10))) }

    /// Today in Cairo, as the server writes dates.
    static var todayISO: String { iso.string(from: .now) }

    /// "Today", "Yesterday", "Tomorrow", else "Thu 25 Sep".
    static func label(_ s: String, today: String) -> String {
        guard let d = date(s), let t = date(today) else { return s }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        switch cal.dateComponents([.day], from: t, to: d).day ?? 0 {
        case 0: return "Today"
        case -1: return "Yesterday"
        case 1: return "Tomorrow"
        default: return short.string(from: d)
        }
    }
}

// MARK: - Images

struct RemoteImage: View {
    let url: String?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url.flatMap(URL.init(string:)), transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
            if let image = phase.image {
                image.resizable().aspectRatio(contentMode: contentMode)
            } else {
                Theme.surface
            }
        }
    }
}

// MARK: - Services

/// "Netflix", "Shahid VIP" — tap to open it there.
struct PlatformChip: View {
    let platform: Platform
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let s = platform.url, let url = URL(string: s) { openURL(url) }
        } label: {
            HStack(spacing: 5) {
                if let logo = platform.logo {
                    RemoteImage(url: logo).frame(width: 16, height: 16).clipShape(.rect(cornerRadius: 4))
                }
                Text(platform.name)
                    .font(.sora(11, .medium, relativeTo: .caption))
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Theme.surface, in: .capsule)
            .foregroundStyle(Theme.paper)
        }
        .buttonStyle(.plain)
        .disabled(platform.url == nil)
    }
}

// MARK: - Poster card

struct PosterCard: View {
    let card: Card
    var width: CGFloat = 118
    var caption: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RemoteImage(url: card.poster)
                .frame(width: width, height: width * 1.5)
                .clipShape(.rect(cornerRadius: 12))
                .overlay(alignment: .topTrailing) {
                    // A rating outside your levels, on something you follow or saved.
                    if card.ageWarn == true, let age = card.age { AgeBadge(text: age).padding(6) }
                }
                .overlay(alignment: .topLeading) {
                    if let tag = card.episodeLabel ?? card.releaseLabel {
                        Text(tag)
                            .font(.sora(10, .semibold, relativeTo: .caption2))
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(.black.opacity(0.65), in: .capsule)
                            .foregroundStyle(Theme.mint)
                            .padding(6)
                    }
                }
            Text(card.title)
                .font(.sora(13, .medium, relativeTo: .subheadline))
                .foregroundStyle(Theme.paper)
                .lineLimit(1)
            // Why it is here ("Because you like Tom Hardy") beats where it streams.
            Text(caption ?? card.reason ?? card.platforms.first?.name ?? card.year.map(String.init) ?? " ")
                .font(.sora(11, relativeTo: .caption))
                .foregroundStyle(caption == nil && card.reason != nil ? Theme.mint : Theme.muted)
                .lineLimit(1)
        }
        .frame(width: width)
    }
}

/// A titled horizontal row of posters.
struct PosterRail: View {
    let title: String
    var detail: String? = nil
    let cards: [Card]
    var caption: (Card) -> String? = { _ in nil }
    let open: (TitleRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title, detail: detail)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(cards) { card in
                        Button { open(card.ref) } label: { PosterCard(card: card, caption: caption(card)) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }
}

/// One row in a list of results: poster, title, where it streams.
struct ResultRow: View {
    let card: Card

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RemoteImage(url: card.poster)
                .frame(width: 62, height: 93)
                .clipShape(.rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 6) {
                Text(card.title)
                    .font(.sora(16, .semibold, relativeTo: .headline))
                    .foregroundStyle(Theme.paper)
                    .lineLimit(2)
                Text([card.year.map(String.init), card.isTV ? "Series" : "Film", card.rating.map { "★ \(String(format: "%.1f", $0))" }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.sora(12, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                if card.platforms.isEmpty {
                    Text("Not on your services")
                        .font(.sora(12, relativeTo: .caption))
                        .foregroundStyle(Theme.faint)
                } else {
                    FlowChips(platforms: card.platforms)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
        .contentShape(.rect)
    }
}

struct FlowChips: View {
    let platforms: [Platform]
    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) { ForEach(platforms, id: \.name) { PlatformChip(platform: $0) } }
        }
        .scrollIndicators(.hidden)
    }
}

/// Shown where a list needs an account behind it.
struct SignInPrompt: View {
    let text: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(text)
                .font(.sora(14, relativeTo: .subheadline))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button("Sign in", action: action)
                .buttonStyle(.glassProminent)
                .tint(Theme.green)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Theme.raised, in: .rect(cornerRadius: 20))
        .padding(.horizontal, 20)
    }
}

/// Lays its children out in rows, starting a new row when one is full — the
/// way the web's flex-wrap does, for rows of buttons that must not run off a
/// narrow screen.
struct WrapLayout: Layout {
    var spacing: CGFloat = 10

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [(indices: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(indices: [Int], width: CGFloat, height: CGFloat)] = []
        var current: (indices: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = ([index], size.width, size.height)
            } else {
                current = (current.indices + [index], needed, max(current.height, size.height))
            }
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

/// An age rating shown as a warning: red, so it reads before the poster does.
struct AgeBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.sora(10.5, .bold, relativeTo: .caption2))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(Color(hex: 0xFF5A52), in: .capsule)
            .foregroundStyle(.white)
    }
}
