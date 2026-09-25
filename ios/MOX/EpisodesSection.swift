import SwiftUI

/// Where you are in a series: a bar of watched, out and still to come, one
/// line saying it in words, and the current season episode by episode with a
/// tick for each you have seen. The web's Episodes, the same.
struct EpisodesSection: View {
    let tmdbId: Int
    @State var progress: SeriesProgress
    let signIn: () -> Void
    @Environment(API.self) private var api

    init(tmdbId: Int, progress: SeriesProgress, signIn: @escaping () -> Void) {
        self.tmdbId = tmdbId
        _progress = State(initialValue: progress)
        self.signIn = signIn
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Episodes").font(.sora(18, .semibold, relativeTo: .headline)).foregroundStyle(Theme.paper)
                Spacer()
                if progress.seasonCount > 1 {
                    Text(progress.seasonName).font(.sora(12.5)).foregroundStyle(Theme.muted)
                }
            }

            GeometryReader { geo in
                let total = CGFloat(max(progress.totalEpisodes, 1))
                let seen = CGFloat(min(progress.watched, progress.aired))
                let out = CGFloat(max(progress.aired - progress.watched, 0))
                HStack(spacing: 0) {
                    Theme.green.frame(width: geo.size.width * seen / total)
                    Color.white.opacity(0.25).frame(width: geo.size.width * out / total)
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 8)
            .background(.white.opacity(0.07))
            .clipShape(.capsule)

            Text(summary).font(.sora(13.5)).foregroundStyle(Theme.muted)

            VStack(spacing: 0) {
                ForEach(progress.episodes, id: \.episode) { e in
                    row(e)
                    if e.episode != progress.episodes.last?.episode {
                        Divider().overlay(.white.opacity(0.06))
                    }
                }
            }
            .background(Theme.surface, in: .rect(cornerRadius: 16))
        }
    }

    private var summary: String {
        let p = progress
        if p.aired == 0 {
            let start = p.next?.airs.map { "Starts \(Self.day($0))" } ?? "Not started yet"
            return "\(start) · \(p.totalEpisodes) episode\(p.totalEpisodes == 1 ? "" : "s")"
        }
        var parts = ["\(p.aired) of \(p.totalEpisodes) out"]
        if api.user != nil { parts.append("you've watched \(p.watched)") }
        if let airs = p.next?.airs { parts.append("next \(Self.day(airs))") }
        else if p.aired >= p.totalEpisodes { parts.append("all out") }
        return parts.joined(separator: " · ")
    }

    private func row(_ e: EpisodeProgress) -> some View {
        HStack(spacing: 12) {
            Text("E\(e.episode)").font(.sora(12.5).monospacedDigit()).foregroundStyle(Theme.faint).frame(width: 30, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.name ?? "Episode \(e.episode)").font(.sora(14, .medium)).foregroundStyle(Theme.paper).lineLimit(1)
                Text(e.airs.map(Self.day) ?? "Date to be announced").font(.sora(12)).foregroundStyle(Theme.faint)
            }
            Spacer(minLength: 8)
            if e.out {
                Button { toggle(e) } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(e.watched ? Theme.ink : Theme.faint)
                        .frame(width: 32, height: 32)
                        .background(e.watched ? Theme.green : .clear, in: .circle)
                        .overlay(Circle().stroke(e.watched ? Theme.green : Theme.faint, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(e.watched ? "Mark episode \(e.episode) unwatched" : "Mark episode \(e.episode) watched")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .opacity(e.out ? 1 : 0.5)
    }

    private func toggle(_ e: EpisodeProgress) {
        guard api.user != nil else { signIn(); return }
        guard let i = progress.episodes.firstIndex(where: { $0.episode == e.episode }) else { return }
        let now = !e.watched
        progress.episodes[i].watched = now
        progress.watched += now ? 1 : -1
        Task {
            do {
                try await api.setEpisodeWatched(tmdbId: tmdbId, season: e.season, episode: e.episode, now)
            } catch {
                progress.episodes[i].watched = !now
                progress.watched += now ? -1 : 1
            }
        }
    }

    /// "Wed 30 Sep".
    static func day(_ iso: String) -> String {
        guard let d = Day.date(iso) else { return iso }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.timeZone = Day.zone
        f.dateFormat = "EEE d MMM"
        return f.string(from: d)
    }
}
