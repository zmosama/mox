import SwiftUI

/// Moods Ask MOX offers before an AI model is connected.
enum Mood: String, CaseIterable, Identifiable {
    case comedy, action, drama, thriller, scifi, horror, romance, animation, crime, documentary
    var id: String { rawValue }

    var label: String {
        switch self {
        case .comedy: "Something funny"
        case .action: "Action"
        case .drama: "Drama"
        case .thriller: "Thriller"
        case .scifi: "Sci‑fi"
        case .horror: "Horror"
        case .romance: "Romance"
        case .animation: "Animation"
        case .crime: "Crime"
        case .documentary: "Documentary"
        }
    }
}

/// The MOX tab. The logo and Ask MOX fill the first screen; scrolling without
/// asking anything brings up the board underneath.
struct HomeView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @Environment(\.scenePhase) private var phase

    @State private var payload: HomePayload?
    /// Whether the ring is on screen, for pausing its animation when it is not.
    @State private var ringVisible = true
    @State private var loadError: String?
    @State private var query = ""
    @State private var mood: Mood?
    @State private var results: [Card] = []
    @State private var people: [PersonChip] = []
    @State private var looking = false
    /// Search comes ten at a time: the page that follows, nil at the end.
    @State private var nextPage: Int?
    @State private var loadingMore = false
    @FocusState private var fieldFocused: Bool
    @State private var showMoods = false
    @State private var dictation = Dictation()

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }
    private var asking: Bool { trimmed.count >= 2 || mood != nil }

    /// Height of the visible scroll area, so the first screen can fill it.
    @State private var viewport: CGFloat = 800
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var wide: Bool { sizeClass == .regular }

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // One hero for both states. The ask bar must stay the same view
                // while the layout around it changes: swapping to a separate
                // compact hero rebuilt the text field and dropped the keyboard
                // on the second letter typed.
                // The week's big picture first, the bar under it; while asking
                // the picture steps aside so the bar rises to the top. Only the
                // picture comes and goes — the bar keeps its place in the stack.
                if !asking, let spots = spotlightCards, !spots.isEmpty {
                    Spotlight(spots: spots) { router.title = $0 }
                        .padding(.top, 8)
                        // Your photo in the top corner, as on the iPad.
                        .overlay(alignment: .topTrailing) {
                            avatar
                                .padding(.trailing, 30)
                                .padding(.top, 20)
                        }
                        .transition(.opacity)
                }
                hero
                if asking { answers } else { board }
            }
            .padding(.bottom, 48)
            .animation(.smooth(duration: 0.3), value: asking)
            .animation(.smooth(duration: 0.25), value: showMoods)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewport = $0 }
        .scrollDismissesKeyboard(.interactively)
        // The edge light is the phone's alone; an iPad (even with Home in a
        // narrow window) stays plain black.
        .background {
            if UIDevice.current.userInterfaceIdiom == .phone { CornerGlow() } else { Color.black.ignoresSafeArea() }
        }
        .refreshable { api.touch(); await load() }
        .task(id: api.revision) { await load() }
        .task(id: trimmed) { await search() }
        .task(id: mood) { await discover() }
        .onDisappear { dictation.stop() }
        .onChange(of: api.user?.mox) { if api.user?.mox == true { dictation.stop() } }
    }

    /// The biggest titles of the week that have a picture.
    private var spotlightCards: [Card]? {
        payload.map { Array($0.trending.filter { $0.backdrop != nil }.prefix(6)) }
    }

    // MARK: - Hero

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    }

    /// Ask MOX along the top — the bar and your face — so the first
    /// screen is what is new, not an empty question. The full-screen hero it
    /// replaced is kept below as `fullScreenHero`.
    private var hero: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                askBar
                    .padding(.leading, 20)
                    .padding(.trailing, asking ? 0 : 20)
                // Beside the bar only while asking, when the bar is at the
                // top; otherwise it stays in the top corner, over the picture.
                if asking {
                    avatar
                        .padding(.trailing, 20)
                }
            }
            .padding(.top, 4)
            if showMoods || mood != nil {
                moodChips
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    /// The original hero, kept for reuse: the ring and the question fill the first screen; while asking, the ring
    /// shrinks and the bar moves up, with answers underneath.
    private var fullScreenHero: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                avatar
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)

            Spacer(minLength: 0)

            LivingRing(size: asking ? 56 : (wide ? 240 : 176), active: ringVisible && router.tab == .home && phase == .active)
                .onScrollVisibilityChange(threshold: 0.05) { ringVisible = $0 }

            if !asking {
                Text(greeting)
                    .font(.sora(wide ? 36 : 28, .medium, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
                    .padding(.top, 12)
                Text("What are we watching tonight?")
                    .font(.sora(wide ? 20 : 17, relativeTo: .body))
                    .foregroundStyle(Theme.paper.opacity(0.72))
                    .padding(.top, 10)
            }

            Spacer(minLength: asking ? 12 : 0)

            if showMoods || mood != nil {
                moodChips
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            askBar
                .padding(.horizontal, 20)
                .readableWidth(760)
        }
        .frame(height: asking ? nil : max(viewport - 84, 500))
    }

    private var avatar: some View {
        Button { router.settings = true } label: {
            Group {
                if let user = api.user, let photo = api.absolute(user.avatar) {
                    AsyncImage(url: photo) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Theme.mint
                    }
                    .frame(width: 40, height: 40)
                    .clipShape(.circle)
                } else if let user = api.user {
                    Text(String(user.name.prefix(1)).uppercased())
                        .font(.sora(17, .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 40, height: 40)
                        .background(Theme.mint, in: .circle)
                } else {
                    Image(systemName: "person.fill")
                        .foregroundStyle(Theme.paper)
                        .frame(width: 40, height: 40)
                        .background(Theme.surface, in: .circle)
                }
            }
            .overlay(Circle().stroke(Theme.green.opacity(0.7), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Account and settings")
    }

    /// "+" for moods, the question, and the mic — or, for the owner, the ring that opens MOX.
    private var askBar: some View {
        HStack(spacing: 10) {
            Button { showMoods.toggle() } label: {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .medium))
                    .rotationEffect(.degrees(showMoods ? 45 : 0))
                    .frame(width: 38, height: 38)
                    .background(Theme.paper.opacity(0.12), in: .circle)
                    .foregroundStyle(Theme.paper)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showMoods ? "Hide moods" : "Pick a mood")

            TextField("", text: $query, prompt: Text(dictation.listening ? "Listening…" : "Films, series, people…").foregroundStyle(Theme.muted))
                .font(.sora(16, relativeTo: .body))
                .foregroundStyle(Theme.paper)
                .focused($fieldFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onChange(of: query) { if !query.isEmpty { mood = nil } }

            if looking {
                MoxPulse(size: 20)
            } else if asking {
                Button {
                    query = ""; mood = nil; fieldFocused = false
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Clear")
            }

            if api.user?.mox == true {
                // The owner's ring opens MOX, where the mic was.
                MoxButton()
            } else {
                Button {
                    fieldFocused = false
                    Task { await dictation.toggle { query = $0 } }
                } label: {
                    Image(systemName: dictation.listening ? "waveform" : "mic.fill")
                        .font(.system(size: 16, weight: .medium))
                        .symbolEffect(.variableColor.iterative, isActive: dictation.listening)
                        .frame(width: 38, height: 38)
                        .background(dictation.listening ? Theme.green.opacity(0.3) : Theme.paper.opacity(0.12), in: .circle)
                        .foregroundStyle(dictation.listening ? Theme.green : Theme.paper)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(dictation.listening ? "Stop listening" : "Speak")
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 8)
        .frame(height: 56)
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var moodChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Mood.allCases) { m in
                    let on = mood == m
                    Button {
                        mood = on ? nil : m
                        query = ""
                        fieldFocused = false
                    } label: {
                        Text(m.label)
                            .font(.sora(13, .medium, relativeTo: .footnote))
                            .foregroundStyle(on ? Theme.ink : Theme.paper)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(on ? Theme.green : Theme.surface.opacity(0.7), in: .capsule)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: - Answers

    @ViewBuilder
    private var answers: some View {
        LazyVStack(alignment: .leading, spacing: 4) {
            // Actors and directors first: a name is as good a way in as a title.
            if mood == nil && !people.isEmpty {
                PeopleRow(title: "People", people: people) { router.person = PersonRef(id: $0) }
                    .padding(.bottom, 16)
            }
            if let mood {
                SectionTitle(text: mood.label, detail: "on your services").padding(.bottom, 8)
            }
            if results.isEmpty && !looking {
                Text(mood == nil ? "Nothing found for “\(trimmed)”." : "Nothing in that mood on your services right now.")
                    .font(.sora(14))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 20)
            }
            // Side by side on an iPad.
            Rows(spacing: 4) {
                ForEach(results) { card in
                    Button { router.title = card.ref } label: { ResultRow(card: card) }
                        .buttonStyle(.plain)
                }
            }
            if mood == nil && nextPage != nil {
                MoxPulse()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                    .onAppear { Task { await searchMore() } }
            }
        }
    }

    // MARK: - Board

    @ViewBuilder
    private var board: some View {
        if let loadError, payload == nil {
            VStack(spacing: 10) {
                Text("Can't reach the MOX server").font(.sora(16, .semibold))
                Text(loadError).font(.sora(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                Button("Try again") { Task { await load() } }.buttonStyle(.glass)
            }
            .padding(.horizontal, 32)
        } else if let payload {
            let spotIds = Set((spotlightCards ?? []).map(\.id))
            if let fresh = payload.fresh, !fresh.isEmpty {
                PosterRail(title: "Just landed", detail: "on your services", cards: fresh) { router.title = $0 }
            }
            // The point of MOX: what to watch, from what you have rated.
            if let picks = payload.picks, !picks.isEmpty {
                PosterRail(title: "Picked for you", detail: "from your ratings", cards: picks) { router.title = $0 }
            }
            if payload.user == nil || !payload.forYou.isEmpty {
                forYou(payload)
            }
            let rest = payload.trending.filter { !spotIds.contains($0.id) }
            if !rest.isEmpty {
                PosterRail(title: "Everyone's watching", detail: "this week", cards: rest) { router.title = $0 }
            }
            if let coming = payload.coming, !coming.isEmpty {
                PosterRail(title: "Coming soon", detail: "most anticipated", cards: coming) { router.title = $0 }
            }
            if let news = payload.fromPeople, !news.isEmpty {
                PosterRail(title: "From people you follow", cards: news.map(\.title),
                           caption: { card in
                               let who = news.first { $0.title.id == card.id }?.person.name ?? ""
                               return [who, card.platforms.first?.name].compactMap { $0 }.joined(separator: " · ")
                           }) { router.title = $0 }
            }
            // Before Airing: signed out, Airing is a long table to scroll past.
            if !wide { ScreenStrip(tiles: payload.explore) }
            AiringSection(episodes: payload.calendar, today: payload.today, signedIn: payload.user != nil)
            if !payload.inStore.isEmpty {
                PosterRail(title: "New in the store", cards: payload.inStore, caption: { $0.price }) { router.title = $0 }
            }
        } else {
            Skeleton(kind: .shelves).padding(.top, 12)
        }
    }

    @ViewBuilder
    private func forYou(_ payload: HomePayload) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "New for you")
            if payload.user == nil {
                SignInPrompt(text: "Sign in to see the new episodes of shows you follow.") { router.settings = true }
            } else if payload.forYou.isEmpty {
                Text("You're caught up — nothing new from your shows since yesterday.")
                    .font(.sora(14))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 20)
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 12) {
                        ForEach(payload.forYou) { card in
                            FreshEpisodeCard(card: card, today: payload.today)
                                // A peek of the next card on a phone; several side by side on an iPad.
                                .containerRelativeFrame(.horizontal) { w, _ in
                                    wide ? min(520, w - 56) : payload.forYou.count > 1 ? w - 56 : w - 40
                                }
                        }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 20)
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollIndicators(.hidden)
            }
        }
    }

    // MARK: - Loading

    private func load() async {
        if payload == nil { payload = api.peek("/api/app/home") }
        do {
            payload = try await api.home()
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func search() async {
        guard mood == nil else { return }
        guard trimmed.count >= 2 else { results = []; people = []; nextPage = nil; return }
        // A short pause between keystrokes: answers now come from our own index.
        try? await Task.sleep(for: .milliseconds(150))
        guard !Task.isCancelled else { return }
        looking = true
        defer { looking = false }
        if let found = try? await api.search(trimmed), !Task.isCancelled {
            results = found.titles
            nextPage = found.next
            people = found.people.map {
                PersonChip(id: $0.id, name: $0.name, profile: $0.profile,
                           role: $0.knownFor.first ?? ($0.department == "Directing" ? "Director" : nil))
            }
        }
    }

    /// The next ten, when the list is scrolled to its end.
    private func searchMore() async {
        guard mood == nil, let page = nextPage, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        let asked = trimmed
        guard let found = try? await api.search(asked, page: page), asked == trimmed else { return }
        let seen = Set(results.map(\.id))
        results += found.titles.filter { !seen.contains($0.id) }
        nextPage = found.next
    }

    private func discover() async {
        guard let mood else { if trimmed.isEmpty { results = []; people = [] }; return }
        results = []
        people = []
        nextPage = nil
        looking = true
        defer { looking = false }
        if let found = try? await api.discover(mood: mood.rawValue), !Task.isCancelled { results = found }
    }
}

/// A new episode you have not watched: big, with Play and a tick.
struct FreshEpisodeCard: View {
    let card: Card
    let today: String
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // In a box of the card's size, so a wide picture cannot widen it.
            Color.clear
                .frame(height: 230)
                .frame(maxWidth: .infinity)
                .overlay { RemoteImage(url: card.backdrop ?? card.poster) }
                .clipped()
            LinearGradient(colors: [.clear, .black.opacity(0.35), .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)
                .overlay(alignment: .topTrailing) {
                    // A rating outside your levels, on a show you follow.
                    if card.ageWarn == true, let age = card.age { AgeBadge(text: age).padding(12) }
                }

            VStack(alignment: .leading, spacing: 6) {
                Text("NEW EPISODE · \(Day.label(card.date ?? today, today: today).uppercased())")
                    .font(.sora(11, .semibold, relativeTo: .caption2))
                    .tracking(1.2)
                    .foregroundStyle(Theme.mint)
                Text(card.title)
                    .font(.sora(24, .bold, relativeTo: .title))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                // Spelled out, so the card reads as one episode rather than the whole show.
                Text([card.season.map { "Season \($0)" }, card.episode.map { "Episode \($0)" }, card.platforms.first?.name]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.sora(13, relativeTo: .footnote))
                    .foregroundStyle(.white.opacity(0.75))

                HStack(spacing: 10) {
                    Button {
                        if let s = card.platforms.first?.url, let url = URL(string: s) { openURL(url) }
                        else { router.title = card.ref }
                    } label: {
                        Label("Play", systemImage: "play.fill")
                            .font(.sora(15, .semibold))
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 22)
                            .frame(height: 42)
                            .background(Theme.paper, in: .capsule)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Task { try? await api.setWatched(card, true) }
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.green)
                            .glassCircle(42)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mark \(card.episodeLabel ?? "episode") watched")

                    Button { router.title = card.ref } label: {
                        Image(systemName: "info")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.paper)
                            .glassCircle(42)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Details")
                }
                .padding(.top, 6)
            }
            .padding(18)
        }
        .frame(height: 230)
        .clipShape(.rect(cornerRadius: 24))
    }
}

/// The TV calendar from the website's board, a week at a time.
struct AiringSection: View {
    let episodes: [CalendarEpisode]
    let today: String
    let signedIn: Bool
    @Environment(Router.self) private var router

    enum Filter: String, CaseIterable { case mine = "Your shows", available = "On services", all = "All" }
    @State private var filter: Filter?

    private var active: Filter { filter ?? (signedIn ? .mine : .all) }

    /// The second of the two weeks the server sends.
    @State private var second = false
    /// The day whose whole list is open, past the first few.
    @State private var open: String?
    @Environment(\.horizontalSizeClass) private var sizeClass

    private static let room = 4

    private var shown: [CalendarEpisode] {
        episodes.filter {
            switch active {
            case .mine: $0.following
            case .available: !$0.platforms.isEmpty
            case .all: true
            }
        }
    }

    var body: some View {
        let byDay = Dictionary(grouping: shown, by: \.airs)
        let week = (0..<7).map { Day.adding($0 + (second ? 7 : 0), to: today) }
        let nextWeek = Day.adding(7, to: today)
        let later = byDay.keys.contains { $0 >= nextWeek }

        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionTitle(text: "Airing", detail: second ? "the week after" : "this week")
                Spacer(minLength: 0)
                if later || second {
                    Button(second ? "‹ This week" : "Next week ›") { withAnimation(.snappy) { second.toggle() } }
                        .font(.sora(13, .medium, relativeTo: .footnote))
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .overlay { Capsule().strokeBorder(Theme.faint, lineWidth: 1) }
                        .buttonStyle(.plain)
                        .padding(.trailing, 20)
                }
            }
            Picker("Show", selection: Binding(get: { active }, set: { filter = $0 })) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .pickerWidth()
            .padding(.horizontal, 20)

            if shown.isEmpty {
                Text(active == .mine ? "None of the shows you follow air in the next two weeks." : "Nothing on the calendar.")
                    .font(.sora(14))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 20)
            }

            // A week at a time, a column a day — empty days included, so it
            // reads as a calendar.
            // Tried in order: all seven across where each still has room for
            // a name (an iPad on its side), else the row you swipe along.
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(week, id: \.self) { day in column(day, byDay[day] ?? []).frame(minWidth: 164, maxWidth: .infinity) }
                }
                .padding(.horizontal, 20)

                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 8) {
                        ForEach(week, id: \.self) { day in column(day, byDay[day] ?? []).frame(width: sizeClass == .regular ? 190 : 168) }
                    }
                    .scrollTargetLayout()
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }

    private func column(_ day: String, _ list: [CalendarEpisode]) -> some View {
        let isToday = day == today
        let head = Day.column(day)
        let all = open == day
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(isToday ? "TODAY" : head.weekday.uppercased())
                    .font(.sora(11.5, .semibold, relativeTo: .caption))
                    .kerning(0.8)
                    .foregroundStyle(isToday ? Theme.green : Theme.muted)
                Spacer(minLength: 0)
                Text("\(head.number)")
                    .font(.sora(18, .bold, relativeTo: .headline))
                    .foregroundStyle(isToday ? Theme.green : (list.isEmpty ? Theme.faint : Theme.paper))
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 2)

            if list.isEmpty {
                Text("Nothing")
                    .font(.sora(12, relativeTo: .caption))
                    .foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity, minHeight: 60)
            }
            ForEach(all ? list : Array(list.prefix(Self.room))) { ep in
                Button {
                    if let id = ep.tmdbId { router.title = TitleRef(tmdbId: id, kind: "tv") }
                } label: {
                    HStack(spacing: 8) {
                        RemoteImage(url: ep.poster)
                            .frame(width: 32, height: 48)
                            .clipShape(.rect(cornerRadius: 6))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ep.show)
                                .font(.sora(12.5, .medium, relativeTo: .footnote))
                                .foregroundStyle(Theme.paper)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Text(["S\(ep.season) E\(ep.episode)", ep.platforms.first?.name].compactMap { $0 }.joined(separator: " · "))
                                .font(.sora(11, relativeTo: .caption2))
                                .foregroundStyle(ep.following ? Theme.green : Theme.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(6)
                    .background(Theme.surface, in: .rect(cornerRadius: 12))
                    .contentShape(.rect(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
            if list.count > Self.room {
                Button(all ? "Show fewer" : "+\(list.count - Self.room) more") { withAnimation(.snappy) { open = all ? nil : day } }
                    .font(.sora(12, .medium, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
                    .buttonStyle(.plain)
            }
        }
        .padding(8)
        .frame(maxHeight: .infinity, alignment: .top)
        .background((isToday ? Theme.green.opacity(0.07) : Theme.raised.opacity(0.6)), in: .rect(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).strokeBorder(isToday ? Theme.green.opacity(0.4) : Theme.faint.opacity(0.35), lineWidth: 1) }
    }
}

/// The week's biggest titles, a page at a time, swiped or moving on by itself
/// every few seconds. The picture keeps its own shape — never cropped — with
/// the words under it, so the slide is as tall as that needs and no taller.
struct Spotlight: View {
    let spots: [Card]
    let open: (TitleRef) -> Void
    @State private var at = 0
    @State private var width: CGFloat = 400

    /// The picture's height at this width, plus room for the words.
    private var height: CGFloat { (width - 40) * 9 / 16 + 150 }

    var body: some View {
        VStack(spacing: 10) {
            // A paging TabView rather than a lazy scroll row: the row only
            // drew slides it had scrolled past, so moving on by itself landed
            // on a black one.
            TabView(selection: $at) {
                ForEach(Array(spots.enumerated()), id: \.element.id) { i, card in
                    slide(card, rank: i + 1).tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: height)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }

            HStack(spacing: 6) {
                ForEach(spots.indices, id: \.self) { i in
                    Capsule()
                        .fill(Theme.paper.opacity(i == at ? 1 : 0.35))
                        .frame(width: i == at ? 18 : 6, height: 6)
                }
            }
            .animation(.smooth, value: at)
        }
        .task(id: at) {
            try? await Task.sleep(for: .seconds(7))
            guard !Task.isCancelled, !spots.isEmpty else { return }
            withAnimation(.smooth) { at = (at + 1) % spots.count }
        }
    }

    /// TMDB's larger picture for the same file: w780 was soft at this size.
    private func sharp(_ url: String?) -> String? {
        url?.replacingOccurrences(of: #"/w\d+/"#, with: "/w1280/", options: .regularExpression)
    }

    private func slide(_ card: Card, rank: Int) -> some View {
        Button { open(card.ref) } label: {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay { RemoteImage(url: sharp(card.backdrop)) }
                    .clipped()
                    .overlay(alignment: .bottom) {
                        LinearGradient(colors: [.clear, Theme.surface], startPoint: .top, endPoint: .bottom)
                            .frame(height: 50)
                    }
                VStack(alignment: .leading, spacing: 6) {
                    Text(["#\(rank) this week", card.platforms.first?.name].compactMap { $0 }.joined(separator: " · ").uppercased())
                        .font(.sora(11, .semibold))
                        .tracking(1.4)
                        .foregroundStyle(Theme.green)
                    Text(card.title)
                        .font(.sora(26, .bold, relativeTo: .title))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text([card.year.map(String.init), card.kind == "tv" ? "Series" : "Film", card.rating.map { String(format: "★ %.1f", $0) }].compactMap { $0 }.joined(separator: " · "))
                        .font(.sora(13))
                        .foregroundStyle(.white.opacity(0.75))
                    if let overview = card.overview {
                        Text(overview)
                            .font(.sora(14))
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(2)
                    }
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 4)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Theme.surface)
            .clipShape(.rect(cornerRadius: 24))
            .padding(.horizontal, 20)
        }
        .buttonStyle(.plain)
    }
}


/// Every screen in MOX as cards on Home ("Explore"), so the dock is not the
/// only way in: a screen in the dock switches to its tab, any other opens over
/// Home. Each card is a glimpse of its screen — its own colour, what is in
/// there right now, and a few posters from inside — rather than a label.
struct ScreenStrip: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @Environment(AppSettings.self) private var settings
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// What the server knows about each screen right now, keyed by tab id.
    var tiles: [String: ExploreTile]?
    /// Two across on a phone, with Today across both; three on an iPad.
    var columns = 2
    /// The next race, read once from what F1 last loaded — not on every redraw.
    @State private var f1Next: String?

    var body: some View {
        let all = TabID.allCases
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Explore")
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                if columns == 2, let first = all.first {
                    // Nine screens: Today across the top leaves eight, four full rows.
                    GridRow { card(first, wide: true).gridCellColumns(2) }
                    rows(Array(all.dropFirst()))
                } else {
                    rows(all)
                }
            }
            .padding(.horizontal, 20)
        }
        .task(id: api.revision) {
            if let next = (api.peek("/api/f1") as F1Board?)?.next, let d = F1Time.parse(next.at) {
                f1Next = "\(next.locality) · in \(F1Time.until(d, from: .now))"
            }
        }
    }

    @ViewBuilder
    private func rows(_ ids: [TabID]) -> some View {
        ForEach(Array(stride(from: 0, to: ids.count, by: columns)), id: \.self) { start in
            GridRow {
                ForEach(ids[start..<min(start + columns, ids.count)]) { id in card(id, wide: false) }
            }
        }
    }

    private func card(_ id: TabID, wide: Bool) -> some View {
        let tint = Self.tint(id)
        let tile = tiles?[id.rawValue]
        // A phone's half-width card has no room for posters beside the words.
        let posters = (wide || sizeClass == .regular) ? (tile?.posters ?? []) : []
        return Button {
            // The iPad's sidebar holds every screen but Calendar and Tasks
            // until they are chosen; the phone's dock only your four.
            let inSidebar = sizeClass == .regular && !id.needsDevice
            if settings.tabs.contains(id) || inSidebar { router.tab = .tab(id) } else { router.screen = id }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: id.icon).font(.system(size: 13, weight: .semibold))
                    Text(id.label).font(.sora(12.5, .semibold, relativeTo: .footnote))
                }
                .foregroundStyle(tint)
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tile?.line ?? line(id))
                            .font(.sora(wide ? 20 : 16, .bold, relativeTo: .headline))
                            .foregroundStyle(Theme.paper)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                        Text(tile?.line != nil ? (tile?.sub ?? line(id)) : (tile?.sub ?? " "))
                            .font(.sora(12, relativeTo: .caption))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if !posters.isEmpty { hand(posters, logos: id == .studios, large: wide) }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: wide ? 118 : 108, alignment: .leading)
            .background {
                ZStack {
                    Theme.surface
                    LinearGradient(colors: [tint.opacity(0.16), tint.opacity(0)], startPoint: .topLeading, endPoint: .center)
                }
            }
            .clipShape(.rect(cornerRadius: 18))
            .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(tint.opacity(0.24), lineWidth: 1) }
            .contentShape(.rect(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    /// A few posters overlapping like a hand of cards.
    private func hand(_ posters: [String], logos: Bool, large: Bool) -> some View {
        let w: CGFloat = large ? 48 : 40
        return HStack(spacing: -12) {
            ForEach(Array(posters.prefix(3).enumerated()), id: \.offset) { n, src in
                Group {
                    if logos {
                        RemoteImage(url: src, contentMode: .fit).padding(5).background(Color(hex: 0xF2F2EE))
                    } else {
                        RemoteImage(url: src)
                    }
                }
                .frame(width: w, height: w * 1.5)
                .clipShape(.rect(cornerRadius: 7))
                .overlay { RoundedRectangle(cornerRadius: 7).strokeBorder(.black.opacity(0.4), lineWidth: 1) }
                .shadow(color: .black.opacity(0.5), radius: 4, y: 2)
                .rotationEffect(.degrees(Double(n) * 4))
                .zIndex(Double(3 - n))
            }
        }
        .accessibilityHidden(true)
    }

    /// Each screen's own colour; F1's is the sport's red, Today's the mark's green.
    private static func tint(_ id: TabID) -> Color {
        switch id {
        case .today: Theme.green
        case .news: Color(hex: 0x4A9EFF)
        case .library: Color(hex: 0xFFB020)
        case .picks: Color(hex: 0x22D3EE)
        case .studios: Color(hex: 0xA78BFA)
        case .friends: Color(hex: 0xFF6B9D)
        case .f1: Color(hex: 0xFF3B30)
        case .calendar: Color(hex: 0xFF8A3D)
        case .tasks: Color(hex: 0x9BE15D)
        }
    }

    /// One line of what is in there — live where MOX already knows it.
    private func line(_ id: TabID) -> String {
        switch id {
        case .f1: return f1Next ?? "Races & standings"
        case .today: return "Out today"
        case .news: return "Headlines"
        case .library: return "Following & watchlist"
        case .picks: return "From your ratings"
        case .studios: return "By studio"
        case .friends: return "What friends watch"
        case .calendar: return "Your calendar"
        case .tasks: return "Your reminders"
        }
    }
}
