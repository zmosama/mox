import SwiftUI

/// A friend's face, or their initial when they have no photo.
struct FriendFace: View {
    let name: String
    let avatar: String?
    var size: CGFloat = 20
    @Environment(API.self) private var api

    var body: some View {
        ZStack {
            Circle().fill(Theme.mint)
            if let url = api.absolute(avatar) {
                RemoteImage(url: url.absoluteString)
            } else {
                Text(name.prefix(1).uppercased())
                    .font(.sora(size * 0.48, .semibold))
                    .foregroundStyle(Theme.ink)
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
        .overlay(Circle().stroke(Theme.ink, lineWidth: 1.5))
    }
}

/// Up to three friends' faces, overlapping.
struct FriendFaces: View {
    let friends: [FriendMark]
    var size: CGFloat = 20

    var body: some View {
        HStack(spacing: -size * 0.3) {
            ForEach(friends.prefix(3), id: \.id) { FriendFace(name: $0.name, avatar: $0.avatar, size: size) }
        }
    }
}

/// "Sara loves it", with her face. More than one friend: the latest, and how many others.
struct FriendsLine: View {
    let friends: [FriendMark]

    var body: some View {
        if let first = friends.first {
            HStack(spacing: 8) {
                FriendFaces(friends: friends)
                (Text("\(first.name) \(first.verb)").foregroundStyle(Theme.mint)
                 + Text(friends.count > 1 ? " · +\(friends.count - 1)" : "").foregroundStyle(Theme.muted))
                    .font(.sora(12, .medium, relativeTo: .caption))
                    .lineLimit(1)
            }
        }
    }
}

/// Every friend's verdict on one title, for its page.
struct FriendsOnTitle: View {
    let friends: [FriendMark]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(friends, id: \.id) { f in
                HStack(spacing: 10) {
                    FriendFace(name: f.name, avatar: f.avatar, size: 26)
                    (Text(f.name).font(.sora(14, .semibold)).foregroundStyle(Theme.paper)
                     + Text(" \(f.verb)").font(.sora(14)).foregroundStyle(Theme.paper.opacity(0.8)))
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: .rect(cornerRadius: 14))
    }
}

/// What your friends rated lately, newest first. One friend at a time, or one
/// kind of verdict, from the chips; twenty at a time as you scroll.
struct FriendsView: View {
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var friends: [Friend]?
    @State private var friend: Int?
    @State private var verdict: String?
    @State private var items: [FriendActivity] = []
    @State private var next: Int?
    @State private var loaded = false
    @State private var loadingMore = false

    private static let verdicts: [(String?, String)] = [
        (nil, "Everything"), ("love", "Loved"), ("like", "Liked"),
        ("watchlist", "Want to watch"), ("seen", "Seen"), ("dislike", "Didn't like"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Friends")
                    .font(.sora(28, .bold, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                if api.user == nil {
                    SignInPrompt(text: "Sign in to see what your friends are watching.") { router.settings = true }
                } else if let friends, friends.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Add friends in Settings — type a name and pick them. What they rate shows up here, and what you rate shows up for them.")
                            .font(.sora(14)).foregroundStyle(Theme.muted)
                        Button("Add friends") { router.settings = true }.buttonStyle(.glass)
                    }
                    .padding(.horizontal, 20)
                } else {
                    chips
                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    } else if items.isEmpty {
                        Text("Nothing rated here yet.").font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                    } else {
                        Rows(spacing: 14, minWidth: 380) {
                            ForEach(items) { row($0) }
                        }
                        .padding(.horizontal, 20)
                        if next != nil {
                            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20).onAppear { Task { await more() } }
                        }
                    }
                }
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .refreshable { await first() }
        .task(id: "\(api.revision)|\(friend ?? 0)|\(verdict ?? "")") { await first() }
    }

    private var chips: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let friends {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        Chip(label: "All friends", on: friend == nil) { friend = nil }
                        ForEach(friends) { f in Chip(label: f.name, on: friend == f.id) { friend = f.id } }
                    }
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
            }
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Self.verdicts, id: \.1) { v, label in Chip(label: label, on: verdict == v) { verdict = v } }
                }
                .padding(.horizontal, 20)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func row(_ item: FriendActivity) -> some View {
        let card = item.title
        return Button { router.title = card.ref } label: {
            HStack(alignment: .top, spacing: 14) {
                RemoteImage(url: card.poster)
                    .frame(width: 62, height: 93)
                    .clipShape(.rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        FriendFace(name: item.friend.name, avatar: item.friend.avatar, size: 22)
                        (Text(item.friend.name).font(.sora(13, .semibold)).foregroundStyle(Theme.paper)
                         + Text(" \(item.friend.verb)").font(.sora(13)).foregroundStyle(Theme.mint))
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(ago(item.at)).font(.sora(11)).foregroundStyle(Theme.faint)
                    }
                    Text(card.title)
                        .font(.sora(16, .semibold, relativeTo: .headline))
                        .foregroundStyle(Theme.paper)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text([card.year.map(String.init), card.isTV ? "Series" : "Film",
                          card.rating.map { "★ \(String(format: "%.1f", $0))" }].compactMap { $0 }.joined(separator: " · "))
                        .font(.sora(12, relativeTo: .caption))
                        .foregroundStyle(Theme.muted)
                    if !card.platforms.isEmpty { FlowChips(platforms: card.platforms) }
                }
                Spacer(minLength: 0)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    private func ago(_ at: Int) -> String {
        let days = Int((Date().timeIntervalSince1970 - Double(at)) / 86_400)
        if days < 1 { return "today" }
        if days < 2 { return "yesterday" }
        if days < 30 { return "\(days)d ago" }
        return Date(timeIntervalSince1970: Double(at)).formatted(.dateTime.day().month(.abbreviated).year())
    }

    private func first() async {
        if api.user == nil { await api.refreshUser() }
        guard api.user != nil else { return }
        guard let page = try? await api.friendActivity(friend: friend, verdict: verdict, page: 1), !Task.isCancelled else {
            loaded = true
            return
        }
        if let f = page.friends { friends = f }
        items = page.items
        next = page.next
        loaded = true
    }

    private func more() async {
        guard let page = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        let asked = (friend, verdict)
        guard let got = try? await api.friendActivity(friend: friend, verdict: verdict, page: page), asked == (friend, verdict) else { return }
        let seen = Set(items.map(\.id))
        items += got.items.filter { !seen.contains($0.id) }
        next = got.next
    }
}

/// Settings → Friends: type a letter or two and pick from who matches; swipe to remove.
struct FriendsSettingsView: View {
    @Environment(API.self) private var api
    @State private var friends: [Friend] = []
    @State private var who = ""
    @State private var suggestions: [Friend] = []
    @State private var message: (ok: Bool, text: String)?
    @State private var busy = false

    var body: some View {
        Form {
            Section {
                HStack {
                    TextField("Start typing a name", text: $who)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .onSubmit(add)
                    Button("Add", action: add).disabled(busy || who.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ForEach(suggestions) { p in
                    Button { add(p) } label: {
                        HStack(spacing: 12) {
                            FriendFace(name: p.name, avatar: p.avatar, size: 30)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name).foregroundStyle(Theme.paper)
                                Text("@\(p.username)").font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Label("Add", systemImage: "plus").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.green)
                        }
                    }
                    .disabled(busy)
                }
                if let message {
                    Text(message.text).font(.footnote).foregroundStyle(message.ok ? Theme.green : .red)
                }
            } footer: {
                Text("Friends see what you rated, and you see theirs — on search, a title's page and the Friends tab." +
                     (api.user.map { " Your username is \($0.username)." } ?? ""))
            }

            if !friends.isEmpty {
                Section("Your friends") {
                    ForEach(friends) { f in
                        HStack(spacing: 12) {
                            FriendFace(name: f.name, avatar: f.avatar, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.name)
                                Text("@\(f.username)").font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    .onDelete { offsets in
                        for i in offsets { remove(friends[i]) }
                    }
                }
            }
        }
        .navigationTitle("Friends")
        .task { friends = (try? await api.friends()) ?? friends }
        // Suggestions from the first letter, as you type.
        .task(id: who) {
            let typed = who.trimmingCharacters(in: .whitespaces)
            guard !typed.isEmpty else { suggestions = []; return }
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled, let found = try? await api.findPeople(typed), !Task.isCancelled else { return }
            suggestions = found
        }
    }

    private func add(_ person: Friend) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let added = try await api.addFriend(id: person.id)
                friends = added.friends
                who = ""
                suggestions = []
                message = (true, "\(added.friend.name) is your friend now.")
            } catch {
                message = (false, error.localizedDescription)
            }
        }
    }

    private func add() {
        if let first = suggestions.first { add(first); return }
        let handle = who.trimmingCharacters(in: .whitespaces)
        guard !handle.isEmpty else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let added = try await api.addFriend(handle)
                friends = added.friends
                who = ""
                message = (true, "\(added.friend.name) is your friend now.")
            } catch {
                message = (false, error.localizedDescription)
            }
        }
    }

    private func remove(_ f: Friend) {
        Task {
            if let left = try? await api.removeFriend(f.id) { friends = left }
        }
    }
}
