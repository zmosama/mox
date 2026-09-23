import SwiftUI

/// The services you pay for — everything else in the app narrows to these.
/// Same list and same save as /admin/services on the website.
struct ServicesView: View {
    @Environment(API.self) private var api
    @State private var services: [ServiceChoice] = []
    @State private var picked: Set<Int> = []
    @State private var loadError: String?
    @State private var saving = false
    @State private var saved: Set<Int> = []

    var body: some View {
        List {
            Section {
                ForEach(services) { service in
                    Button {
                        if picked.contains(service.providerId) { picked.remove(service.providerId) }
                        else { picked.insert(service.providerId) }
                    } label: {
                        HStack(spacing: 12) {
                            RemoteImage(url: service.logo)
                                .frame(width: 32, height: 32)
                                .clipShape(.rect(cornerRadius: 8))
                            Text(service.name).foregroundStyle(Theme.paper)
                            Spacer()
                            Image(systemName: picked.contains(service.providerId) ? "checkmark.circle.fill" : "circle")
                                .font(.title3)
                                .foregroundStyle(picked.contains(service.providerId) ? Theme.green : Theme.faint)
                        }
                    }
                }
            } footer: {
                Text(loadError ?? "Pick what you subscribe to. Until you do, MOX shows every service, not just yours.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.ink)
        .navigationTitle("Your services")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    save()
                } label: {
                    if saving { ProgressView() } else { Text(picked == saved ? "Saved" : "Save") }
                }
                .disabled(picked == saved || saving)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            services = try await api.services()
            picked = Set(services.filter(\.selected).map(\.providerId))
            saved = picked
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                try await api.saveServices(Array(picked))
                saved = picked
            } catch {
                loadError = error.localizedDescription
            }
        }
    }
}

/// The website's rating wall: every title, most likely-seen first. Tap a
/// poster to say what you thought; your ratings drive what MOX suggests.
struct RateView: View {
    @Environment(API.self) private var api
    @State private var items: [WallItem] = []
    @State private var filter: Filter = .unrated
    @State private var loadError: String?

    enum Filter: String, CaseIterable { case unrated = "Unrated", all = "All", tv = "TV", movie = "Films" }

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 12, alignment: .top)]

    private var shown: [WallItem] {
        items.filter {
            switch filter {
            case .unrated: $0.verdict == nil
            case .all: true
            case .tv: $0.kind == "tv"
            case .movie: $0.kind == "movie"
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Show", selection: $filter) {
                    ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)

                if let loadError {
                    Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted)
                } else if items.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }

                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(shown) { item in
                        RateTile(item: item) { verdict in rate(item, verdict) }
                    }
                }
            }
            .padding(20)
        }
        .background(Theme.ink)
        .navigationTitle("Rate titles")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            items = try await api.ratingWall()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func rate(_ item: WallItem, _ verdict: String?) {
        guard let i = items.firstIndex(of: item) else { return }
        items[i].verdict = verdict
        Task { try? await api.setVerdict(item.ref, verdict) }
    }
}

/// One poster on the rating wall. Tapping opens the choices; the ring round
/// the poster shows what you picked.
private struct RateTile: View {
    let item: WallItem
    let rate: (String?) -> Void

    var body: some View {
        Menu {
            Button("Loved it", systemImage: "heart.fill") { rate("love") }
            Button("Liked it", systemImage: "hand.thumbsup") { rate("like") }
            Button("Not for me", systemImage: "hand.thumbsdown") { rate("dislike") }
            Button("Want to watch", systemImage: "bookmark") { rate("watchlist") }
            Button("Don't show me this", systemImage: "eye.slash") { rate("hidden") }
            if item.verdict != nil {
                Button("Clear", role: .destructive) { rate(nil) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                RemoteImage(url: item.poster)
                    .aspectRatio(2 / 3, contentMode: .fit)
                    .clipShape(.rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Verdict.color(item.verdict), lineWidth: item.verdict == nil ? 0 : 3)
                    }
                    .overlay(alignment: .topTrailing) {
                        if let icon = Verdict.icon(item.verdict) {
                            Image(systemName: icon)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.ink)
                                .frame(width: 24, height: 24)
                                .background(Verdict.color(item.verdict), in: .circle)
                                .padding(6)
                        }
                    }
                    .opacity(item.verdict == "dislike" || item.verdict == "hidden" ? 0.45 : 1)
                Text(item.title)
                    .font(.sora(12, .medium, relativeTo: .caption))
                    .foregroundStyle(Theme.paper)
                    .lineLimit(1)
                Text(item.year.map(String.init) ?? " ")
                    .font(.sora(11, relativeTo: .caption2))
                    .foregroundStyle(Theme.muted)
            }
        }
        .buttonStyle(.plain)
    }
}

/// The website's verdict colours, so a rating reads the same on both.
enum Verdict {
    static func color(_ verdict: String?) -> Color {
        switch verdict {
        case "love": Theme.green
        case "like": Color(hex: 0x4A9EFF)
        case "dislike": Color(hex: 0xFF5A52)
        case "watchlist": Color(hex: 0xFFB020)
        case "hidden", "seen": Color(hex: 0x6C7873)
        default: .clear
        }
    }

    static func icon(_ verdict: String?) -> String? {
        switch verdict {
        case "love": "heart.fill"
        case "like": "hand.thumbsup.fill"
        case "dislike": "hand.thumbsdown.fill"
        case "watchlist": "bookmark.fill"
        case "hidden": "eye.slash"
        case "seen": "checkmark"
        default: nil
        }
    }
}
