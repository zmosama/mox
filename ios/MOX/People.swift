import SwiftUI

/// A round photo, or initials when TMDB has none.
struct PersonFace: View {
    let url: String?
    let name: String
    var size: CGFloat = 76

    private var initials: String {
        name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    var body: some View {
        ZStack {
            Theme.surface
            if let url {
                RemoteImage(url: url)
            } else {
                Text(initials).font(.sora(size * 0.3, .semibold)).foregroundStyle(Theme.muted)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay(Circle().stroke(.white.opacity(0.1), lineWidth: 1))
    }
}

/// A titled, sideways-scrolling row of faces — cast, people you follow.
struct PeopleRow: View {
    var title: String?
    let people: [PersonChip]
    var size: CGFloat = 76
    let open: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { SectionTitle(text: title) }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 8) {
                    ForEach(people, id: \.key) { person in
                        Button { open(person.id) } label: {
                            VStack(spacing: 6) {
                                PersonFace(url: person.profile, name: person.name, size: size)
                                Text(person.name)
                                    .font(.sora(12.5, .medium, relativeTo: .caption))
                                    .foregroundStyle(Theme.paper)
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                if let role = person.role, !role.isEmpty {
                                    Text(role)
                                        .font(.sora(11, relativeTo: .caption2))
                                        .foregroundStyle(Theme.muted)
                                        .lineLimit(1)
                                }
                            }
                            .frame(width: size + 16)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }
}

/// An actor or director and everything they made. What you can watch tonight
/// comes first — the part of their work that is one tap away — then what is
/// coming, then all of it, newest first. The web's PersonSheet, the same order.
struct PersonSheet: View {
    let id: Int
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss

    @State private var person: PersonDetail?
    @State private var loadError: String?
    @State private var role: Role?
    @State private var kind: Kind = .all
    @State private var bioOpen = false
    @State private var title: TitleRef?
    @State private var signingIn = false

    enum Role: String { case acting, crew }
    enum Kind: String, CaseIterable { case all = "All", movie = "Films", tv = "TV" }

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 12, alignment: .top)]

    var body: some View {
        ScrollView {
            if let person {
                content(person)
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
        .sheet(item: $title) { TitleSheet(ref: $0) }
        .sheet(isPresented: $signingIn) { SettingsView() }
        .task { await load() }
    }

    // MARK: - Filtering

    /// "Director" means directed: crew credits also carry producing and the like.
    private func directed(_ c: Card) -> Bool {
        (c.role ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.contains("Director")
    }

    private func sections(_ p: PersonDetail) -> (hasActing: Bool, hasCrew: Bool, directs: Bool, active: Role, shown: [Card]) {
        let directs = p.credits.contains { $0.as == "crew" && directed($0) }
        let inCrew: (Card) -> Bool = { $0.as == "crew" && (!directs || directed($0)) }
        let hasActing = p.credits.contains { $0.as == "acting" }
        let hasCrew = p.credits.contains(where: inCrew)
        let active = role ?? ((p.department ?? "Acting") != "Acting" && hasCrew ? .crew : .acting)
        let shown = p.credits.filter { c in
            let roleOK = !hasActing || !hasCrew || (active == .acting ? c.as == "acting" : inCrew(c))
            let kindOK = kind == .all || c.kind == (kind == .movie ? "movie" : "tv")
            return roleOK && kindOK
        }
        return (hasActing, hasCrew, directs, active, shown)
    }

    // MARK: - Content

    private func content(_ p: PersonDetail) -> some View {
        let s = sections(p)
        let today = Day.todayISO
        let now = s.shown.filter { !$0.platforms.isEmpty && ($0.date ?? "") != "" && ($0.date ?? "") <= today }
        let coming = s.shown.filter { ($0.date ?? "").isEmpty || ($0.date ?? "") > today }.reversed()

        return VStack(alignment: .leading, spacing: 26) {
            VStack(spacing: 12) {
                PersonFace(url: p.profile, name: p.name, size: 128)
                    .overlay(Circle().stroke(Theme.green.opacity(0.5), lineWidth: 2))
                Text(p.name)
                    .font(.sora(28, .bold, relativeTo: .largeTitle))
                    .foregroundStyle(Theme.paper)
                    .multilineTextAlignment(.center)
                Text(facts(p))
                    .font(.sora(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                Button { toggleFollow(p) } label: {
                    Label(p.following ? "Following" : "Follow", systemImage: p.following ? "bookmark.fill" : "bookmark")
                        .font(.sora(15, .semibold))
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .background(p.following ? Theme.green.opacity(0.2) : Theme.green, in: .capsule)
                        .foregroundStyle(p.following ? Theme.green : Theme.ink)
                }
                .buttonStyle(.plain)
                if p.following {
                    Text("New work from \(p.name.split(separator: " ").first.map(String.init) ?? p.name) shows up on Home when it reaches your services.")
                        .font(.sora(12.5))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 36)
            .padding(.horizontal, 20)

            if let bio = p.bio {
                Button { withAnimation { bioOpen.toggle() } } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(bio)
                            .font(.sora(14.5, relativeTo: .body))
                            .foregroundStyle(Theme.paper.opacity(0.85))
                            .lineSpacing(3)
                            .lineLimit(bioOpen ? nil : 4)
                            .multilineTextAlignment(.leading)
                        Text(bioOpen ? "Less" : "More").font(.sora(13, .medium)).foregroundStyle(Theme.green)
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
            }

            VStack(spacing: 10) {
                if s.hasActing && s.hasCrew {
                    Picker("Role", selection: Binding(get: { s.active }, set: { role = $0 })) {
                        Text("Actor").tag(Role.acting)
                        Text(s.directs ? "Director" : "Behind the camera").tag(Role.crew)
                    }
                }
                Picker("Kind", selection: $kind) {
                    ForEach(Kind.allCases, id: \.self) { Text($0.rawValue) }
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)

            if !now.isEmpty {
                PosterRail(title: "On your services", detail: "\(now.count)", cards: now, caption: { $0.role }) { title = $0 }
            }
            if !coming.isEmpty {
                PosterRail(title: "Coming", detail: "\(coming.count)", cards: Array(coming),
                           caption: { $0.date.map { String($0.prefix(4)) } ?? "Soon" }) { title = $0 }
            }

            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Everything", detail: "\(s.shown.count)")
                LazyVGrid(columns: columns, spacing: 18) {
                    ForEach(s.shown) { card in
                        Button { title = card.ref } label: { PosterCard(card: card, width: 104) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .padding(.bottom, 40)
    }

    private func facts(_ p: PersonDetail) -> String {
        var parts: [String] = []
        switch p.department {
        case "Acting": parts.append("Actor")
        case "Directing": parts.append("Director")
        case let d?: parts.append(d)
        default: break
        }
        if let born = p.birthday.flatMap(Day.date) {
            let end = p.deathday.flatMap(Day.date) ?? .now
            let years = Calendar(identifier: .gregorian).dateComponents([.year], from: born, to: end).year ?? 0
            parts.append(p.deathday == nil ? "\(years)" : "died at \(years)")
        }
        if let place = p.place { parts.append(place) }
        return parts.joined(separator: " · ")
    }

    private func toggleFollow(_ p: PersonDetail) {
        guard api.user != nil else { signingIn = true; return }
        let following = !p.following
        person?.following = following
        Task { try? await api.setFollowing(person: p, following) }
    }

    private func load() async {
        do {
            person = try await api.person(id)
        } catch {
            loadError = error.localizedDescription
        }
    }
}
