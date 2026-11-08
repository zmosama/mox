import SwiftUI

// MOX, the owner's assistant — the web's /mox, natively. The server decides
// who may talk to it (owner only, 404 for anyone else); the app only shows
// the way in to the owner.

nonisolated struct MoxLine: Codable, Hashable, Sendable, Identifiable {
    var id: Int
    let role: String
    var text: String
    var titles: [Card]?
}

nonisolated struct MoxHistory: Codable, Sendable {
    let connected: Bool
    let lines: [MoxLine]
}

nonisolated struct MoxMemory: Codable, Hashable, Sendable, Identifiable {
    let id: Int
    let text: String
    let source: String
}

nonisolated struct MoxMemories: Codable, Sendable { let memories: [MoxMemory] }

nonisolated struct MoxModel: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let label: String
}

nonisolated struct MoxSettings: Codable, Sendable {
    let soul: String
    let defaultSoul: String
    let chatModel: String
    let models: [MoxModel]
}

/// One line of the answer stream: `{t, v}`, where v is words, a status, or posters.
nonisolated enum MoxEvent: Decodable, Sendable {
    case status(String), text(String), titles([Card]), done, error(String)

    private enum Keys: String, CodingKey { case t, v }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .t) {
        case "status": self = .status(try c.decode(String.self, forKey: .v))
        case "text": self = .text(try c.decode(String.self, forKey: .v))
        case "titles": self = .titles(try c.decode([Card].self, forKey: .v))
        case "error": self = .error(try c.decode(String.self, forKey: .v))
        default: self = .done
        }
    }
}

extension API {
    func moxHistory() async throws -> MoxHistory { try await get("/api/mox/chat") }

    func moxClear() async throws {
        var request = URLRequest(url: try url("/api/mox/chat"))
        request.httpMethod = "DELETE"
        let _: [String: AnyCodable] = try await send(request)
    }

    /// One message; the answer comes back a piece at a time.
    func moxSay(_ message: String) -> AsyncThrowingStream<MoxEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: try url("/api/mox/chat"))
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "content-type")
                    request.httpBody = try JSONSerialization.data(withJSONObject: ["message": message])
                    // A long answer with tools can take a while to start.
                    request.timeoutInterval = 120
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard (200..<300).contains(code) else {
                        var body = Data()
                        for try await byte in bytes { body.append(byte) }
                        let message = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["error"] as? String
                        throw APIError.status(code, message)
                    }
                    let decoder = JSONDecoder()
                    for try await line in bytes.lines where !line.isEmpty {
                        guard let event = try? decoder.decode(MoxEvent.self, from: Data(line.utf8)) else { continue }
                        continuation.yield(event)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    func moxMemories() async throws -> [MoxMemory] {
        let payload: MoxMemories = try await get("/api/mox/memories")
        return payload.memories
    }

    func moxRemember(_ text: String) async throws -> [MoxMemory] {
        var request = URLRequest(url: try url("/api/mox/memories"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])
        let payload: MoxMemories = try await send(request)
        return payload.memories
    }

    func moxForget(_ id: Int) async throws -> [MoxMemory] {
        var request = URLRequest(url: try url("/api/mox/memories", ["id": String(id)]))
        request.httpMethod = "DELETE"
        let payload: MoxMemories = try await send(request)
        return payload.memories
    }

    func moxSettings() async throws -> MoxSettings { try await get("/api/mox/settings") }

    func moxSave(soul: String? = nil, chatModel: String? = nil) async throws {
        var body: [String: Any] = [:]
        if let soul { body["soul"] = soul }
        if let chatModel { body["chatModel"] = chatModel }
        var request = URLRequest(url: try url("/api/mox/settings"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let _: [String: AnyCodable] = try await send(request)
    }
}

// MARK: - The way in

/// The ring as a button: on Home's ask bar and the iPad's search field, in the
/// microphone's place, for the owner.
struct MoxButton: View {
    @Environment(Router.self) private var router
    var size: CGFloat = 38

    var body: some View {
        Button { router.mox = true } label: {
            Image("TabRing")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: size * 0.64, height: size * 0.64)
                .frame(width: size, height: size)
                .background(Theme.paper.opacity(0.12), in: .circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Talk to MOX")
    }
}

// MARK: - The conversation

private let starters = [
    "What should I watch tonight?",
    "عايز حاجة زي آخر حاجة حبيتها",
    "What's new on my services this week?",
    "إيه آخر أخبار الفورمولا ١؟",
]

struct MoxView: View {
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [MoxLine] = []
    @State private var connected = true
    @State private var loaded = false
    @State private var draft = ""
    @State private var busy = false
    @State private var status: String?
    @State private var error: String?
    @State private var turn: Task<Void, Never>?
    @State private var open: TitleRef?
    @State private var mind = false
    @State private var confirmClear = false
    @State private var clearing = false
    /// Following the reply as it is written — only while he is at the bottom.
    @State private var following = true
    @State private var nearBottom = true
    @State private var scrolling = false
    @FocusState private var typing: Bool

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroller in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 18) {
                        header
                        if loaded && lines.isEmpty && connected { startersView }
                        ForEach(lines) { line in
                            MoxBubble(line: line) { open = $0 }
                                .id(line.id)
                        }
                        if busy, let status {
                            HStack(spacing: 8) {
                                ProgressView().controlSize(.small)
                                Text(status).font(.sora(13)).foregroundStyle(Theme.muted)
                            }
                            .padding(.horizontal, 20)
                        }
                        if let error {
                            Text(error).font(.sora(13.5)).foregroundStyle(.red.opacity(0.85)).padding(.horizontal, 20)
                        }
                        if !loaded && error != nil {
                            Button("Try again") { Task { await load() } }
                                .font(.sora(14, .semibold)).foregroundStyle(Theme.green).padding(.horizontal, 20)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.vertical, 12)
                    // One centred column: on an iPad the two sides of the talk stay close.
                    .frame(maxWidth: 760)
                    .frame(maxWidth: .infinity)
                }
                // Only his own scrolling decides: the reply growing past the
                // bottom is not him scrolling away from it.
                .onScrollGeometryChange(for: Bool.self) { g in
                    g.contentOffset.y + g.containerSize.height >= g.contentSize.height - 120
                } action: { _, near in
                    nearBottom = near
                    if scrolling { following = near }
                }
                .onScrollPhaseChange { _, phase in
                    scrolling = phase == .interacting || phase == .decelerating
                    if phase == .idle, !scrolling { following = following || nearBottom }
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .onChange(of: lines) { if following { scroller.scrollTo("end", anchor: .bottom) } }
                .onChange(of: typing) { if typing { scroller.scrollTo("end", anchor: .bottom) } }
            }
            .safeAreaInset(edge: .bottom) { composer }
            // Pure black: the ring's picture has black edges, which show as a square on anything else.
            .background(Color.black.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { mind = true } label: { Label("What MOX knows", systemImage: "brain") }
                        Button(role: .destructive) { confirmClear = true } label: { Label("Start over", systemImage: "arrow.counterclockwise") }
                            .disabled(lines.isEmpty || busy || clearing)
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("More")
                }
            }
            .confirmationDialog("Start a new conversation? What MOX remembers about you stays.", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Start over", role: .destructive) { Task { await clear() } }
            }
            .sheet(item: $open) { TitleSheet(ref: $0) }
            .sheet(isPresented: $mind) { MoxMind() }
            .task { await load() }
            .onDisappear { turn?.cancel() }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            LivingRing(size: lines.isEmpty ? 120 : 64, active: true, charged: busy)
                .frame(height: lines.isEmpty ? 150 : 84)
                .animation(.smooth(duration: 0.35), value: lines.isEmpty)
            if lines.isEmpty {
                Text("Hi \(api.user?.name ?? "") — what are we watching?")
                    .font(.sora(20, .semibold, relativeTo: .title3))
                    .foregroundStyle(Theme.paper)
                    .multilineTextAlignment(.center)
            }
            if !connected {
                Text("No model is connected on the server, so MOX can't answer right now.")
                    .font(.sora(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
    }

    private var startersView: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(starters, id: \.self) { s in
                Button { send(s) } label: {
                    Text(s)
                        .font(.sora(14, relativeTo: .subheadline))
                        .foregroundStyle(Theme.paper)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface, in: .rect(cornerRadius: 14))
                        .environment(\.layoutDirection, s.isArabic ? .rightToLeft : .leftToRight)
                }
                .buttonStyle(.plain)
                .disabled(!connected)
            }
        }
        .padding(.horizontal, 20)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Message MOX", text: $draft, prompt: Text(connected ? "Ask MOX…" : "MOX isn't connected yet").foregroundStyle(Theme.muted), axis: .vertical)
                .font(.sora(16, relativeTo: .body))
                .foregroundStyle(Theme.paper)
                .lineLimit(1...6)
                .focused($typing)
                .disabled(!connected)
                .submitLabel(.send)
                // A hardware keyboard's Return sends; Shift-Return is a new line.
                .onKeyPress(.return, phases: .down) { press in
                    if press.modifiers.contains(.shift) { return .ignored }
                    if canSend && !busy { send(draft) }
                    return .handled
                }
                .padding(.vertical, 9)
                .environment(\.layoutDirection, draft.isArabic ? .rightToLeft : .leftToRight)
            Button {
                if busy { turn?.cancel() } else { send(draft) }
            } label: {
                Image(systemName: busy ? "stop.fill" : "arrow.up")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(busy || canSend ? Theme.green : Theme.paper.opacity(0.12), in: .circle)
                    .foregroundStyle(busy || canSend ? Theme.ink : Theme.muted)
            }
            .buttonStyle(.plain)
            .disabled(!busy && !canSend)
            .accessibilityLabel(busy ? "Stop" : "Send")
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 26))
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private var canSend: Bool { loaded && !clearing && connected && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private func load() async {
        do {
            let history = try await api.moxHistory()
            // A turn already under way keeps its bubbles: the server has them too, by the next open.
            if !busy { lines = history.lines }
            connected = history.connected
            error = nil
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func clear() async {
        clearing = true
        defer { clearing = false }
        do {
            try await api.moxClear()
            lines = []
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func send(_ raw: String) {
        let message = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard loaded, !clearing, !message.isEmpty, !busy else { return }
        following = true
        draft = ""
        error = nil
        busy = true
        status = "Thinking"
        // Local ids below zero: the server's own come back with the next load.
        let base = (lines.map(\.id).min() ?? 0) - 2
        lines.append(MoxLine(id: base, role: "user", text: message, titles: nil))
        lines.append(MoxLine(id: base - 1, role: "assistant", text: "", titles: nil))
        // Found by its id, not its place: the list can change under a turn.
        let replyID = base - 1
        func edit(_ change: (inout MoxLine) -> Void) {
            if let i = lines.firstIndex(where: { $0.id == replyID }) { change(&lines[i]) }
        }
        turn = Task {
            do {
                for try await event in api.moxSay(message) {
                    switch event {
                    case .status(let s): status = s
                    case .text(let t): edit { $0.text += t }; status = nil
                    case .titles(let cards): edit { $0.titles = cards }
                    case .error(let e): error = e
                    case .done: break
                    }
                }
            } catch is CancellationError {
            } catch let e as URLError where e.code == .cancelled {
            } catch {
                self.error = error.localizedDescription
            }
            edit { $0.text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
            // Nothing came back at all: drop the empty bubble.
            if let i = lines.firstIndex(where: { $0.id == replyID }), lines[i].text.isEmpty, (lines[i].titles ?? []).isEmpty {
                lines.remove(at: i)
            }
            busy = false
            status = nil
        }
    }
}

private struct MoxBubble: View {
    let line: MoxLine
    let open: (TitleRef) -> Void

    var body: some View {
        let mine = line.role == "user"
        VStack(alignment: mine ? .trailing : .leading, spacing: 10) {
            if !line.text.isEmpty {
                MoxRich(text: line.text, rtl: line.text.isArabic)
                    .font(.sora(15.5, relativeTo: .body))
                    .foregroundStyle(mine ? Theme.ink : Theme.paper)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(mine ? Theme.mint : Theme.surface, in: .rect(cornerRadius: 18))
                    .environment(\.layoutDirection, line.text.isArabic ? .rightToLeft : .leftToRight)
                    .frame(maxWidth: 560, alignment: mine ? .trailing : .leading)
                    .textSelection(.enabled)
            }
            if let titles = line.titles, !titles.isEmpty {
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(titles) { card in
                            Button { open(card.ref) } label: { PosterCard(card: card, width: 104) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
                .padding(.horizontal, -20)
            }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        .padding(.horizontal, 20)
    }
}

/// **bold** and "- " / "1. " lists — all MOX's replies use. Plain text otherwise.
private struct MoxRich: View {
    let text: String
    /// An Arabic reply: every line reads right to left, even one that starts
    /// with an English name — without the mark, "**Inception**: فيلم…" took
    /// its direction from the name and its punctuation landed on the wrong side.
    var rtl = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if let item = block.item {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(block.marker)
                        Text(Self.inline(mark + item)).fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    Text(Self.inline(mark + block.text)).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .multilineTextAlignment(.leading)
    }

    private var mark: String { rtl ? "\u{200F}" : "" }

    private struct Block { let text: String; let item: String?; let marker: String }

    private var blocks: [Block] {
        text.split(separator: "\n", omittingEmptySubsequences: true).compactMap { raw in
            let line = String(raw)
            guard !line.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
            if let m = line.firstMatch(of: /^\s*([-•*]|\d+[.)])\s+(.*)$/) {
                let marker = String(m.1)
                return Block(text: line, item: String(m.2), marker: marker.first?.isNumber == true ? marker : "•")
            }
            return Block(text: line, item: nil, marker: "")
        }
    }

    static func inline(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }
}

// MARK: - What MOX knows

/// Its memories (read, forget, tell it something), its soul, and the model.
private struct MoxMind: View {
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss
    @State private var memories: [MoxMemory] = []
    @State private var settings: MoxSettings?
    @State private var soul = ""
    @State private var model = ""
    @State private var newMemory = ""
    @State private var error: String?
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if memories.isEmpty {
                        Text("Nothing yet. MOX saves what it learns about you as you talk.").foregroundStyle(.secondary)
                    }
                    ForEach(memories) { m in
                        Text(m.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .environment(\.layoutDirection, m.text.isArabic ? .rightToLeft : .leftToRight)
                            .swipeActions {
                                Button("Forget", role: .destructive) { Task { await forget(m.id) } }
                                    .tint(.red)
                            }
                    }
                    HStack {
                        TextField("Tell MOX something to remember", text: $newMemory)
                            .environment(\.layoutDirection, newMemory.isArabic ? .rightToLeft : .leftToRight)
                            .submitLabel(.done)
                            .onSubmit { Task { await remember() } }
                        // Borderless: in a Form row a plain button takes the whole row's taps.
                        Button("Add") { Task { await remember() } }
                            .buttonStyle(.borderless)
                            .disabled(newMemory.trimmingCharacters(in: .whitespaces).count < 3)
                    }
                } header: {
                    Text("What it remembers")
                } footer: {
                    Text("Swipe one to forget it.")
                }

                if let settings {
                    Section {
                        TextEditor(text: $soul)
                            .environment(\.layoutDirection, soul.isArabic ? .rightToLeft : .leftToRight)
                            .frame(minHeight: 140)
                            .overlay(alignment: .topLeading) {
                                if soul.isEmpty {
                                    Text(settings.defaultSoul).foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 4).allowsHitTesting(false)
                                }
                            }
                        Button(saved ? "Saved" : "Save soul") { Task { await saveSoul() } }
                            .disabled(soul == settings.soul)
                            .onChange(of: soul) { saved = false }
                    } header: {
                        Text("Its soul — how it talks")
                    } footer: {
                        Text("Leave it empty for MOX's own.")
                    }

                    Section("Model") {
                        Picker("Model", selection: $model) {
                            ForEach(settings.models) { Text($0.label).tag($0.id) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                        .onChange(of: model) { old, new in
                            guard !old.isEmpty, new != settings.chatModel else { return }
                            Task { await saveModel(new) }
                        }
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("What MOX knows")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .task { await load() }
        }
        .preferredColorScheme(.dark)
    }

    private func load() async {
        do { memories = try await api.moxMemories() } catch { self.error = error.localizedDescription }
        // Older servers have no settings to read: the section simply isn't shown.
        if let s = try? await api.moxSettings() {
            settings = s
            soul = s.soul
            model = s.chatModel
        }
    }

    private func remember() async {
        guard newMemory.trimmingCharacters(in: .whitespaces).count >= 3 else { return }
        do {
            memories = try await api.moxRemember(newMemory.trimmingCharacters(in: .whitespaces))
            newMemory = ""
        } catch { self.error = error.localizedDescription }
    }

    private func forget(_ id: Int) async {
        do { memories = try await api.moxForget(id) } catch { self.error = error.localizedDescription }
    }

    private func saveSoul() async {
        do {
            try await api.moxSave(soul: soul)
            if let s = settings { settings = MoxSettings(soul: soul, defaultSoul: s.defaultSoul, chatModel: s.chatModel, models: s.models) }
            saved = true
        } catch { self.error = error.localizedDescription }
    }

    private func saveModel(_ id: String) async {
        do {
            try await api.moxSave(chatModel: id)
            if let s = settings { settings = MoxSettings(soul: s.soul, defaultSoul: s.defaultSoul, chatModel: id, models: s.models) }
        } catch {
            self.error = error.localizedDescription
            model = settings?.chatModel ?? model
        }
    }
}

extension String {
    /// Direction from the first strong letter, like the web's dir="auto".
    var isArabic: Bool {
        for scalar in unicodeScalars {
            let v = scalar.value
            if (0x0590...0x08FF).contains(v) || (0xFB1D...0xFDFF).contains(v) || (0xFE70...0xFEFF).contains(v) { return true }
            if scalar.properties.isAlphabetic { return false }
        }
        return false
    }
}
