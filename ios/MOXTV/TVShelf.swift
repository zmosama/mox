import SwiftUI

/// One shelf of posters. Each is a link, so the focus engine lifts the one in
/// focus, the remote's swipe moves along the row, and a press opens the title.
struct TVRow: View {
    let title: String
    var detail: String? = nil
    let cards: [Card]
    /// Told which card has the focus, for a screen that shows it large.
    var focused: Binding<Card?>? = nil
    /// Play/Pause on a poster, where the screen can start it directly.
    var play: ((Card) -> Void)? = nil
    @FocusState private var focus: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                Text(title)
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(TV.paper)
                if let detail {
                    Text(detail).font(.system(size: 24)).foregroundStyle(TV.muted)
                }
            }
            .padding(.horizontal, TV.edge)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 36) {
                    ForEach(cards) { card in
                        NavigationLink(value: card.ref) {
                            TVImage(path: card.poster)
                                .frame(width: 220, height: 330)
                        }
                        .buttonStyle(.card)
                        .focused($focus, equals: card.id)
                        .onPlayPauseCommand { play?(card) }
                        .accessibilityLabel(card.title)
                    }
                }
                .padding(.horizontal, TV.edge)
                .padding(.vertical, 30)
            }
            .scrollClipDisabled()
        }
        .focusSection()
        .onChange(of: focus) { _, id in
            if let card = cards.first(where: { $0.id == id }) { focused?.wrappedValue = card }
        }
    }
}

/// A row of faces: the cast, the director. A press opens what else they made.
struct TVPeopleRow: View {
    let title: String
    let people: [PersonChip]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(TV.paper)
                .padding(.horizontal, TV.edge)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 40) {
                    ForEach(people, id: \.key) { person in
                        NavigationLink(value: PersonRef(id: person.id)) {
                            VStack(spacing: 12) {
                                TVImage(path: person.profile)
                                    .frame(width: 170, height: 170)
                                    .clipShape(.circle)
                                Text(person.name)
                                    .font(.system(size: 23, weight: .medium))
                                    .foregroundStyle(TV.paper)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.center)
                                if let role = person.role, !role.isEmpty {
                                    Text(role)
                                        .font(.system(size: 20))
                                        .foregroundStyle(TV.muted)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.center)
                                }
                            }
                            .frame(width: 200)
                        }
                        .buttonStyle(.borderless)
                    }
                }
                .padding(.horizontal, TV.edge)
                .padding(.vertical, 24)
            }
            .scrollClipDisabled()
        }
        .focusSection()
    }
}

/// The picture behind a shelf screen: the focused title's, dimmed towards the rows.
struct TVBackdrop: View {
    let card: Card?

    var body: some View {
        GeometryReader { geo in
            ZStack {
                TV.ink
                if let card {
                    TVImage(path: card.backdrop?.replacingOccurrences(of: "/t/p/w780/", with: "/t/p/w1280/") ?? card.poster)
                        .frame(width: geo.size.width, height: geo.size.height * 0.78)
                        .clipped()
                        .frame(maxHeight: .infinity, alignment: .top)
                        .id(card.id)
                        .transition(.opacity)
                }
                LinearGradient(stops: [
                    .init(color: TV.ink.opacity(0.92), location: 0),
                    .init(color: TV.ink.opacity(0.35), location: 0.55),
                    .init(color: .clear, location: 1),
                ], startPoint: .leading, endPoint: .trailing)
                LinearGradient(stops: [
                    .init(color: .clear, location: 0.25),
                    .init(color: TV.ink, location: 0.74),
                ], startPoint: .top, endPoint: .bottom)
            }
            .animation(.easeInOut(duration: 0.35), value: card?.id)
        }
        .ignoresSafeArea()
    }
}

/// The focused title in words: name, what is new about it, where it plays.
struct TVSpotlight: View {
    let card: Card?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let card {
                Text(card.title)
                    .font(.system(size: 66, weight: .bold))
                    .foregroundStyle(TV.paper)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                HStack(spacing: 16) {
                    if let label = card.episodeLabel ?? card.releaseLabel {
                        Text(label).foregroundStyle(TV.green).fontWeight(.semibold)
                    }
                    if let year = card.year { Text(String(year)) }
                    if let rating = card.rating, rating > 0 { Text("★ " + String(format: "%.1f", rating)) }
                    if !card.platforms.isEmpty { Text(card.platforms.map(\.name).joined(separator: " · ")) }
                }
                .font(.system(size: 28))
                .foregroundStyle(TV.muted)
                if let text = card.reason ?? card.overview {
                    Text(text)
                        .font(.system(size: 27))
                        .foregroundStyle(TV.paper.opacity(0.82))
                        .lineLimit(3)
                        .frame(maxWidth: 900, alignment: .leading)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.2), value: card?.id)
    }
}

extension View {
    /// Where a poster or a face leads, on every screen that shows them.
    func tvDestinations() -> some View {
        navigationDestination(for: TitleRef.self) { TVTitle(ref: $0) }
            .navigationDestination(for: PersonRef.self) { TVPerson(ref: $0) }
    }
}

/// A person: who they are, and what they made that MOX knows.
struct TVPerson: View {
    @Environment(API.self) private var api
    let ref: PersonRef
    @State private var person: PersonDetail?
    @State private var problem: String?

    var body: some View {
        ZStack {
            TV.ink.ignoresSafeArea()
            if let person {
                ScrollView {
                    VStack(alignment: .leading, spacing: 40) {
                        HStack(alignment: .top, spacing: 50) {
                            TVImage(path: person.profile)
                                .frame(width: 260, height: 390)
                                .clipShape(.rect(cornerRadius: 16))
                            VStack(alignment: .leading, spacing: 16) {
                                Text(person.name)
                                    .font(.system(size: 66, weight: .bold))
                                    .foregroundStyle(TV.paper)
                                Text([person.department, person.place].compactMap { $0 }.joined(separator: "  ·  "))
                                    .font(.system(size: 28))
                                    .foregroundStyle(TV.muted)
                                if let bio = person.bio, !bio.isEmpty {
                                    Text(bio)
                                        .font(.system(size: 27))
                                        .foregroundStyle(TV.paper.opacity(0.85))
                                        .lineLimit(8)
                                }
                            }
                        }
                        .padding(.horizontal, TV.edge)
                        .padding(.top, 60)
                        TVRow(title: "Known for", cards: person.credits)
                    }
                    .padding(.bottom, 80)
                }
                .scrollClipDisabled()
                .ignoresSafeArea(edges: .horizontal)
            } else if let problem {
                Text(problem).font(.system(size: 30)).foregroundStyle(.orange)
            } else {
                ProgressView()
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .task {
            do { person = try await api.person(ref.id) } catch { problem = "Can't load this person: \(error.localizedDescription)" }
        }
    }
}
