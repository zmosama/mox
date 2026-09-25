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

    @State private var payload: HomePayload?
    @State private var loadError: String?
    @State private var query = ""
    @State private var mood: Mood?
    @State private var results: [Card] = []
    @State private var people: [PersonChip] = []
    @State private var looking = false
    @FocusState private var fieldFocused: Bool
    @State private var showMoods = false
    @State private var dictation = Dictation()

    private var trimmed: String { query.trimmingCharacters(in: .whitespaces) }
    private var asking: Bool { trimmed.count >= 2 || mood != nil }

    /// Height of the visible scroll area, so the first screen can fill it.
    @State private var viewport: CGFloat = 800

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // One hero for both states. The ask bar must stay the same view
                // while the layout around it changes: swapping to a separate
                // compact hero rebuilt the text field and dropped the keyboard
                // on the second letter typed.
                hero
                if asking { answers } else { board }
            }
            .padding(.bottom, 48)
            .animation(.smooth(duration: 0.3), value: asking)
            .animation(.smooth(duration: 0.25), value: showMoods)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewport = $0 }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.black)
        .refreshable { await load() }
        .task(id: api.revision) { await load() }
        .task(id: trimmed) { await search() }
        .task(id: mood) { await discover() }
        .onDisappear { dictation.stop() }
    }

    // MARK: - Hero

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    }

    /// The ring and the question fill the first screen; while asking, the ring
    /// shrinks and the bar moves up, with answers underneath.
    private var hero: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                avatar
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)

            Spacer(minLength: 0)

            LivingRing(size: asking ? 56 : 176)

            if !asking {
                Text(greeting)
                    .font(.sora(28, .medium, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
                    .padding(.top, 12)
                Text("What are we watching tonight?")
                    .font(.sora(17, relativeTo: .body))
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

    /// "+" for moods, the question, and the mic — the mockup's bar.
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

            TextField("", text: $query, prompt: Text(dictation.listening ? "Listening…" : "Ask MOX anything…").foregroundStyle(Theme.muted))
                .font(.sora(16, relativeTo: .body))
                .foregroundStyle(Theme.paper)
                .focused($fieldFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onChange(of: query) { if !query.isEmpty { mood = nil } }

            if looking {
                ProgressView().controlSize(.small)
            } else if asking {
                Button {
                    query = ""; mood = nil; fieldFocused = false
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                }
                .accessibilityLabel("Clear")
            }

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
        .padding(.leading, 8)
        .padding(.trailing, 8)
        .frame(height: 56)
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(.horizontal, 20)
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
            ForEach(results) { card in
                Button { router.title = card.ref } label: { ResultRow(card: card) }
                    .buttonStyle(.plain)
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
            forYou(payload)
            if let news = payload.fromPeople, !news.isEmpty {
                PosterRail(title: "From people you follow", cards: news.map(\.title),
                           caption: { card in
                               let who = news.first { $0.title.id == card.id }?.person.name ?? ""
                               return [who, card.platforms.first?.name].compactMap { $0 }.joined(separator: " · ")
                           }) { router.title = $0 }
            }
            AiringSection(episodes: payload.calendar, today: payload.today, signedIn: payload.user != nil)
            if !payload.trending.isEmpty {
                PosterRail(title: "Trending", detail: "on your services", cards: payload.trending) { router.title = $0 }
            }
            if !payload.inStore.isEmpty {
                PosterRail(title: "New in the store", cards: payload.inStore, caption: { $0.price }) { router.title = $0 }
            }
        } else {
            ProgressView().padding(.top, 40)
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
                                .containerRelativeFrame(.horizontal) { w, _ in payload.forYou.count > 1 ? w - 56 : w - 40 }
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
        guard trimmed.count >= 2 else { results = []; people = []; return }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        looking = true
        defer { looking = false }
        if let found = try? await api.search(trimmed), !Task.isCancelled {
            results = found.titles
            people = found.people.map {
                PersonChip(id: $0.id, name: $0.name, profile: $0.profile,
                           role: $0.knownFor.first ?? ($0.department == "Directing" ? "Director" : nil))
            }
        }
    }

    private func discover() async {
        guard let mood else { if trimmed.isEmpty { results = []; people = [] }; return }
        results = []
        people = []
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

    private var days: [(String, [CalendarEpisode])] {
        let shown = episodes.filter {
            switch active {
            case .mine: $0.following
            case .available: !$0.platforms.isEmpty
            case .all: true
            }
        }
        let grouped = Dictionary(grouping: shown, by: \.airs)
        return grouped.keys.sorted().prefix(7).map { ($0, grouped[$0]!) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionTitle(text: "Airing", detail: "next two weeks")
            Picker("Show", selection: Binding(get: { active }, set: { filter = $0 })) {
                ForEach(Filter.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)

            if days.isEmpty {
                Text(active == .mine ? "None of the shows you follow air in the next two weeks." : "Nothing on the calendar.")
                    .font(.sora(14))
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 20)
            }

            ForEach(days, id: \.0) { day, list in
                VStack(alignment: .leading, spacing: 8) {
                    Text(Day.label(day, today: today))
                        .font(.sora(13, .semibold, relativeTo: .footnote))
                        .foregroundStyle(day == today ? Theme.green : Theme.muted)
                        .padding(.horizontal, 20)
                    ForEach(list) { ep in
                        Button {
                            if let id = ep.tmdbId { router.title = TitleRef(tmdbId: id, kind: "tv") }
                        } label: {
                            HStack(spacing: 12) {
                                RemoteImage(url: ep.poster)
                                    .frame(width: 40, height: 60)
                                    .clipShape(.rect(cornerRadius: 8))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(ep.show)
                                        .font(.sora(15, .medium, relativeTo: .subheadline))
                                        .foregroundStyle(Theme.paper)
                                        .lineLimit(1)
                                    Text([ep.code, ep.platforms.first?.name].compactMap { $0 }.joined(separator: " · "))
                                        .font(.sora(12, relativeTo: .caption))
                                        .foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if ep.following {
                                    Image(systemName: "bookmark.fill").font(.caption).foregroundStyle(Theme.green)
                                }
                            }
                            .padding(10)
                            .background(Theme.raised, in: .rect(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
    }
}
