import SwiftUI

/// The website's /new page.
struct TodayView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router

    enum When: String, CaseIterable { case out = "Out now", soon = "Coming" }
    enum Kind: String, CaseIterable {
        case all = "All", movie = "Films", tv = "TV"
        func matches(_ card: Card) -> Bool { self == .all || card.kind == String(describing: self) }
    }

    @State private var payload: TodayPayload?
    @State private var loadError: String?
    @State private var when: When = .out
    @State private var kind: Kind = .all

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                header
                filters
                timeline
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .refreshable { api.touch(); await load() }
        .task(id: api.revision) { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(.sora(13, .medium, relativeTo: .footnote))
                .foregroundStyle(Theme.green)
            Text("Today")
                .font(.sora(28, .bold, relativeTo: .title))
                .foregroundStyle(Theme.paper)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    // MARK: - Timeline

    private var filters: some View {
        VStack(spacing: 10) {
            Picker("When", selection: $when) {
                ForEach(When.allCases, id: \.self) { Text($0.rawValue) }
            }
            Picker("Kind", selection: $kind) {
                ForEach(Kind.allCases, id: \.self) { Text($0.rawValue) }
            }
        }
        .pickerStyle(.segmented)
        .pickerWidth()
        .padding(.horizontal, 20)
    }

    /// Date, then that date split by service — the question is "what landed on
    /// Netflix this week", not one undifferentiated grid.
    private var days: [(date: String, services: [(String, [Card])])] {
        guard let payload else { return [] }
        let source = when == .out ? payload.available : payload.upcoming
        let cards = source.filter(kind.matches)
        let byDate = Dictionary(grouping: cards) { $0.date ?? "" }
        let order = when == .out ? byDate.keys.sorted(by: >) : byDate.keys.sorted()
        return order.map { date in
            var byService: [String: [Card]] = [:]
            var serviceOrder: [String] = []
            for card in byDate[date]! {
                let name = card.platforms.first?.name ?? "Elsewhere"
                if byService[name] == nil { serviceOrder.append(name) }
                byService[name, default: []].append(card)
            }
            return (date, serviceOrder.map { ($0, byService[$0]!) })
        }
    }

    @ViewBuilder
    private var timeline: some View {
        if let loadError, payload == nil {
            Text(loadError).font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
        } else if let payload {
            if days.isEmpty {
                Text("Nothing here yet.").font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
            }
            ForEach(days, id: \.date) { day in
                VStack(alignment: .leading, spacing: 18) {
                    Text(day.date.isEmpty ? "Undated" : Day.label(day.date, today: payload.today))
                        .font(.sora(20, .semibold, relativeTo: .title3))
                        .foregroundStyle(day.date == payload.today ? Theme.green : Theme.paper)
                        .padding(.horizontal, 20)
                    ForEach(day.services, id: \.0) { service, cards in
                        PosterRail(title: service, detail: "\(cards.count)", cards: cards,
                                   caption: { $0.episodeLabel ?? ($0.isTV ? "Series" : "Film") }) { router.title = $0 }
                    }
                }
            }
        } else {
            Skeleton(kind: .rows).padding(.top, 12)
        }
    }

    private func load() async {
        if payload == nil { payload = api.peek("/api/app/today") }
        do {
            payload = try await api.today()
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }
}
