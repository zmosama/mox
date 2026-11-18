import SwiftUI

/// The TV calendar a month at a time — the website's /calendar.
///
/// The days gone by stay on it, dimmed, so "what did I miss" has an answer;
/// today is lit; the month before and after are a tap away. An iPad shows the
/// month as a grid, Sunday first like pogdesign's TV Calendar. A phone cannot
/// fit seven columns with a show's name in each, so it lists the days that
/// have something on, today always among them, and opens on today.
struct TvCalendarView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @Environment(\.horizontalSizeClass) private var size

    enum Filter: String, CaseIterable { case mine = "Your shows", available = "On services", all = "All" }

    private struct MonthPayload: Decodable { let episodes: [CalendarEpisode] }

    @State private var today = Day.todayISO
    @State private var month = String(Day.todayISO.prefix(7))
    @State private var months: [String: [CalendarEpisode]] = [:]
    @State private var failed: String?
    @State private var filter: Filter?
    /// The day whose whole list is open, past the first few (iPad grid).
    @State private var open: String?

    private static let room = 3
    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private var active: Filter { filter ?? (api.user == nil ? .all : .mine) }
    private var thisMonth: String { String(today.prefix(7)) }

    var body: some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    content(reader)
                }
                .padding(.bottom, 48)
            }
            .background(Theme.ink)
            .refreshable { months[month] = nil; await load(month) }
            .task(id: "\(month)|\(api.revision)") { await load(month) }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.name(month, year: true))
                    .font(.sora(13, .medium, relativeTo: .footnote))
                    .foregroundStyle(Theme.green)
                Text("Calendar")
                    .font(.sora(28, .bold, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
            }
            Picker("Show", selection: Binding(get: { active }, set: { filter = $0 })) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .pickerWidth()
            HStack(spacing: 8) {
                step("‹ \(Self.name(Self.add(-1, to: month), year: false))") { go(Self.add(-1, to: month)) }
                if month != thisMonth { step("Today") { go(thisMonth) } }
                step("\(Self.name(Self.add(1, to: month), year: false)) ›") { go(Self.add(1, to: month)) }
            }
        }
        .padding(.horizontal, margin)
        .padding(.top, 12)
    }

    private func step(_ label: String, _ action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.sora(13, .medium, relativeTo: .footnote))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .overlay { Capsule().strokeBorder(Theme.faint, lineWidth: 1) }
            .buttonStyle(.plain)
    }

    private func go(_ to: String) {
        open = nil
        withAnimation(.snappy) { month = to }
    }

    private var margin: CGFloat { size == .regular ? IPad.margin : 20 }

    // MARK: - Content

    @ViewBuilder
    private func content(_ reader: ScrollViewProxy) -> some View {
        if let list = months[month] {
            let shown = list.filter {
                switch active {
                case .mine: $0.following
                case .available: !$0.platforms.isEmpty
                case .all: true
                }
            }
            let byDay = Dictionary(grouping: shown, by: \.airs)
            if shown.isEmpty {
                Text(active == .mine
                     ? "None of the shows you follow air in \(Self.name(month, year: false))."
                     : "Nothing on the calendar in \(Self.name(month, year: false)).")
                    .font(.sora(14))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, margin)
            }
            if size == .regular {
                grid(byDay)
            } else {
                agenda(byDay)
                    .onAppear {
                        // Open on today, not on the 1st, when this is the month you are in.
                        if month == thisMonth { reader.scrollTo(today, anchor: .top) }
                    }
            }
        } else if failed == month {
            VStack(spacing: 10) {
                Text("Couldn't load \(Self.name(month, year: true)).")
                    .font(.sora(14)).foregroundStyle(Theme.muted)
                Button("Try again") { Task { await load(month) } }
                    .font(.sora(14, .medium)).foregroundStyle(Theme.paper)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 40)
        } else {
            Skeleton(kind: .tiles).padding(.top, 8)
        }
    }

    /// The month as a grid, a week a row.
    private func grid(_ byDay: [String: [CalendarEpisode]]) -> some View {
        let days = Self.days(in: month)
        let lead = Self.weekdays.firstIndex(of: Day.column(days.first ?? month).weekday) ?? 0
        var cells: [String?] = Array(repeating: nil, count: lead) + days.map { Optional($0) }
        while cells.count % 7 != 0 { cells.append(nil) }
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: 7)
        return VStack(alignment: .leading, spacing: 6) {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(Self.weekdays, id: \.self) { d in
                    Text(d.uppercased())
                        .font(.sora(11, .semibold, relativeTo: .caption2))
                        .kerning(0.8)
                        .foregroundStyle(Theme.faint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
                ForEach(Array(cells.enumerated()), id: \.offset) { _, day in
                    if let day {
                        dayCard(day, byDay[day] ?? [], compact: true)
                    } else {
                        Color.clear.frame(height: 1)
                    }
                }
            }
        }
        .padding(.horizontal, margin)
    }

    /// The days with something on, in order, today always among them.
    private func agenda(_ byDay: [String: [CalendarEpisode]]) -> some View {
        let days = Self.days(in: month).filter { byDay[$0] != nil || $0 == today }
        return LazyVStack(spacing: 10) {
            ForEach(days, id: \.self) { day in
                dayCard(day, byDay[day] ?? [], compact: false).id(day)
            }
        }
        .padding(.horizontal, margin)
    }

    private func dayCard(_ day: String, _ list: [CalendarEpisode], compact: Bool) -> some View {
        let isToday = day == today
        let past = day < today
        let head = Day.column(day)
        let all = !compact || open == day
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                // The grid has the weekdays over its columns; the list needs one on each day.
                Text(isToday ? "TODAY" : compact ? "" : head.weekday.uppercased())
                    .font(.sora(11.5, .semibold, relativeTo: .caption))
                    .kerning(0.8)
                    .foregroundStyle(isToday ? Theme.green : Theme.muted)
                Spacer(minLength: 0)
                Text("\(head.number)")
                    .font(.sora(18, .bold, relativeTo: .headline))
                    .foregroundStyle(isToday ? Theme.green : (list.isEmpty ? Theme.faint : Theme.paper))
            }
            .padding(.horizontal, 4)

            if list.isEmpty {
                Text("Nothing")
                    .font(.sora(12, relativeTo: .caption))
                    .foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity, minHeight: compact ? 70 : 36)
            }
            ForEach(all ? list : Array(list.prefix(Self.room))) { ep in episode(ep, compact: compact) }
            if compact && list.count > Self.room {
                Button(all ? "Show fewer" : "+\(list.count - Self.room) more") {
                    withAnimation(.snappy) { open = all ? nil : day }
                }
                .font(.sora(12, .medium, relativeTo: .caption))
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
                .buttonStyle(.plain)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: compact ? 150 : nil, alignment: .top)
        .background(isToday ? Theme.green.opacity(0.09) : Theme.raised.opacity(past ? 0.3 : 0.6), in: .rect(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(isToday ? Theme.green.opacity(0.55) : Theme.faint.opacity(past ? 0.2 : 0.35), lineWidth: isToday ? 1.5 : 1)
        }
        .opacity(past ? 0.5 : 1)
    }

    private func episode(_ ep: CalendarEpisode, compact: Bool) -> some View {
        Button {
            if let id = ep.tmdbId { router.title = TitleRef(tmdbId: id, kind: "tv") }
        } label: {
            // In the iPad's grid a day is barely 130 points wide: a smaller
            // poster leaves the name room for whole words ("MobLan / d" was
            // what the first one left it).
            HStack(spacing: compact ? 6 : 8) {
                RemoteImage(url: ep.poster)
                    .frame(width: compact ? 22 : 34, height: compact ? 33 : 51)
                    .clipShape(.rect(cornerRadius: 5))
                VStack(alignment: .leading, spacing: 2) {
                    Text(ep.show)
                        .font(.sora(compact ? 12 : 14, .medium, relativeTo: .footnote))
                        .foregroundStyle(Theme.paper)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .multilineTextAlignment(.leading)
                    Text("S\(ep.season) E\(ep.episode)")
                        .font(.sora(11, relativeTo: .caption2))
                        .foregroundStyle(ep.following ? Theme.green : Theme.muted)
                    if let service = ep.platforms.first?.name {
                        Text(service)
                            .font(.sora(11, relativeTo: .caption2))
                            .foregroundStyle(Theme.faint)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(compact ? 5 : 6)
            .background(Theme.surface, in: .rect(cornerRadius: 12))
            .contentShape(.rect(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Data

    private func load(_ m: String) async {
        today = Day.todayISO
        if months[m] != nil { return }
        do {
            let body: MonthPayload = try await api.get("/api/calendar", ["month": m])
            months[m] = body.episodes
            if failed == m { failed = nil }
        } catch is CancellationError {
            return
        } catch {
            failed = m
        }
    }

    // MARK: - Months, as the server writes them ("2026-11")

    private static func add(_ n: Int, to m: String) -> String {
        let parts = m.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return m }
        let index = parts[0] * 12 + (parts[1] - 1) + n
        return String(format: "%04d-%02d", index / 12, index % 12 + 1)
    }

    private static func days(in m: String) -> [String] {
        let first = "\(m)-01"
        var out: [String] = []
        var d = first
        while d.hasPrefix(m) && out.count < 31 {
            out.append(d)
            d = Day.adding(1, to: d)
        }
        return out
    }

    private static func name(_ m: String, year: Bool) -> String {
        guard let d = Day.date("\(m)-15") else { return m }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.timeZone = Day.zone
        f.dateFormat = year ? "LLLL yyyy" : "LLLL"
        return f.string(from: d)
    }
}
