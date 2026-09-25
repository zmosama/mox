import PhotosUI
import SwiftUI

/// Opened from the avatar on the MOX tab.
struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(API.self) private var api
    @Environment(CalendarStore.self) private var calendar
    @Environment(Notifier.self) private var notifier
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    @State private var username = ""
    @State private var password = ""
    @State private var signInError: String?
    @State private var working = false
    @State private var aiKey = ""
    @State private var photo: PhotosPickerItem?
    @State private var photoError: String?
    @State private var savingPhoto = false
    @State private var prefs: Prefs?

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            Form {
                account

                Section {
                    Toggle("Show my calendar in Today", isOn: Binding(
                        get: { settings.showCalendarInToday && calendar.canReadEvents },
                        set: { on in Task { settings.showCalendarInToday = on ? await calendar.requestEvents() : false } }
                    ))
                } header: {
                    Text("Your day")
                } footer: {
                    Text(accessNote)
                }

                Section {
                    NavigationLink {
                        TabsSettingsView()
                    } label: {
                        LabeledContent("Tabs", value: settings.tabs.map(\.label).joined(separator: ", "))
                    }
                } footer: {
                    Text("Which tabs sit either side of the ring, and in what order.")
                }

                if api.user != nil, let prefs {
                    Section {
                        Toggle("English", isOn: langBinding("en", prefs))
                        Toggle("عربي", isOn: langBinding("ar", prefs))
                    } header: {
                        Text("News")
                    } footer: {
                        Text("Which newsrooms the News tab reads.")
                    }

                    Section {
                        Toggle("Hide results until I've watched", isOn: Binding(
                            get: { prefs.f1Shield },
                            set: { on in savePrefs(["f1Shield": on]) }
                        ))
                    } header: {
                        Text("F1")
                    } footer: {
                        Text("A race's result, and the standings it changed, stay covered until you say you've seen it.")
                    }
                }

                notifications

                Section {
                    Picker("Provider", selection: $settings.aiProvider) {
                        ForEach(["Anthropic", "OpenAI", "Other"], id: \.self) { Text($0) }
                    }
                    SecureField("API key", text: $aiKey)
                        .textContentType(.password)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { settings.aiKey = aiKey }
                    if settings.hasAIKey {
                        Button("Remove key", role: .destructive) { settings.aiKey = ""; aiKey = "" }
                    }
                } header: {
                    Text("Ask MOX")
                } footer: {
                    Text(settings.hasAIKey
                         ? "Key saved in the Keychain. Conversations with the model are coming next — until then Ask MOX keeps searching."
                         : "Without a key, Ask MOX searches titles and moods. Add your own model's key to talk to it instead.")
                }

                Section {
                    TextField("Server", text: $settings.server)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server")
                } footer: {
                    Text("Where your MOX website runs.")
                }

                Section {
                    AboutView()
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                } header: {
                    Text("About")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.ink)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        if aiKey != settings.aiKey { settings.aiKey = aiKey }
                        dismiss()
                    }
                }
            }
            .onAppear { aiKey = settings.aiKey }
            .task(id: api.user?.id) { prefs = api.user == nil ? nil : try? await api.prefs() }
        }
    }

    // MARK: - Preferences

    private func langBinding(_ lang: String, _ prefs: Prefs) -> Binding<Bool> {
        Binding(
            get: { prefs.newsLangs.contains(lang) },
            set: { on in
                let langs = on ? prefs.newsLangs + [lang] : prefs.newsLangs.filter { $0 != lang }
                // At least one: a News tab reading no newsroom would only ever be empty.
                guard !langs.isEmpty else { return }
                savePrefs(["newsLangs": langs])
            }
        )
    }

    private func savePrefs(_ patch: [String: Any]) {
        Task {
            if let saved = try? await api.savePrefs(patch) {
                prefs = saved
                api.touch()
            }
        }
    }

    // MARK: - Notifications

    private var notifications: some View {
        Section {
            Toggle("New episodes", isOn: notifyBinding(\.notifyEpisodes))
            if settings.notifyEpisodes {
                DatePicker("Episodes at", selection: notifyTime, displayedComponents: .hourAndMinute)
                    .environment(\.timeZone, Day.zone)
            }
            Toggle("Watchlist arrivals", isOn: notifyBinding(\.notifyWatchlist))
            Toggle("F1 sessions", isOn: notifyBinding(\.notifyF1))
            if settings.notifyF1 {
                Picker("Before the start", selection: Binding(
                    get: { settings.f1Lead },
                    set: { settings.f1Lead = $0; Task { await notifier.refresh(api: api, settings: settings, force: true) } }
                )) {
                    ForEach([5, 15, 30, 60], id: \.self) { Text("\($0) minutes").tag($0) }
                }
            }
            if notifier.status == .denied {
                Button("Open iOS Settings") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                }
            }
        } header: {
            Text("Notifications")
        } footer: {
            Text(notificationNote)
        }
        .disabled(api.user == nil)
        .task { await notifier.checkStatus() }
    }

    private var notificationNote: String {
        if api.user == nil { return "Sign in to be told about your shows and your watchlist." }
        if notifier.status == .denied { return "Notifications are off for MOX in iOS Settings." }
        return "New episodes: shows you follow, on the day they reach you. Watchlist arrivals: when something you want to watch lands on one of your services. F1: before qualifying, sprints and races — never a result."
    }

    /// Turning one on asks iOS for permission first; refused, it stays off.
    private func notifyBinding(_ path: ReferenceWritableKeyPath<AppSettings, Bool>) -> Binding<Bool> {
        Binding(
            get: { settings[keyPath: path] && notifier.status != .denied },
            set: { on in
                Task {
                    settings[keyPath: path] = on ? await notifier.requestPermission() : false
                    await notifier.refresh(api: api, settings: settings, force: true)
                }
            }
        )
    }

    /// Minutes after midnight in Cairo, shown as a time of day.
    private var notifyTime: Binding<Date> {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = Day.zone
        return Binding(
            get: { cal.date(byAdding: .minute, value: settings.notifyAt, to: cal.startOfDay(for: .now)) ?? .now },
            set: { date in
                let parts = cal.dateComponents([.hour, .minute], from: date)
                settings.notifyAt = (parts.hour ?? 10) * 60 + (parts.minute ?? 0)
                Task { await notifier.refresh(api: api, settings: settings, force: true) }
            }
        )
    }

    @ViewBuilder
    private var account: some View {
        Section("Account") {
            if let user = api.user {
                HStack(spacing: 14) {
                    Group {
                        if let url = api.absolute(user.avatar) {
                            AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.mint }
                        } else {
                            Text(String(user.name.prefix(1)).uppercased())
                                .font(.sora(24, .semibold))
                                .foregroundStyle(Theme.ink)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Theme.mint)
                        }
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(.circle)
                    .overlay(Circle().stroke(Theme.green.opacity(0.7), lineWidth: 1.5))

                    VStack(alignment: .leading, spacing: 6) {
                        Text(user.name).font(.sora(17, .semibold))
                        HStack(spacing: 14) {
                            // Worked out here: the picker's label closure is Sendable
                            // and may not read the view's state itself.
                            let pickLabel = savingPhoto ? "Saving…" : user.avatar == nil ? "Add a photo" : "Change photo"
                            PhotosPicker(selection: $photo, matching: .images) {
                                Text(pickLabel)
                            }
                            .disabled(savingPhoto)
                            if user.avatar != nil {
                                Button("Remove", role: .destructive) {
                                    Task { try? await api.removeAvatar() }
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                        .font(.sora(14, .medium))
                        if let photoError {
                            Text(photoError).font(.footnote).foregroundStyle(.red)
                        }
                    }
                }
                .padding(.vertical, 4)
                .onChange(of: photo) { uploadPhoto() }

                LabeledContent("Signed in as", value: user.name)
                NavigationLink {
                    ServicesView()
                } label: {
                    Label("Your services", systemImage: "play.tv")
                }
                NavigationLink {
                    RateView()
                } label: {
                    Label("Rate titles", systemImage: "star")
                }
                Button("Sign out", role: .destructive) {
                    Task { await api.signOut(); notifier.clearAll() }
                }
            } else {
                TextField("Username", text: $username)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .onSubmit(signIn)
                if let signInError {
                    Text(signInError).foregroundStyle(.red).font(.footnote)
                }
                Button(action: signIn) {
                    if working { ProgressView() } else { Text("Sign in") }
                }
                .disabled(username.isEmpty || password.isEmpty || working)
            }
        }
    }

    private var accessNote: String {
        "Reads and writes the calendars and reminders already on this iPhone — iCloud, Google, Outlook — so what you add in MOX shows up there too, and the other way round."
    }

    private func uploadPhoto() {
        guard let photo else { return }
        savingPhoto = true
        photoError = nil
        Task {
            defer { savingPhoto = false; self.photo = nil }
            do {
                guard let data = try await photo.loadTransferable(type: Data.self) else { return }
                try await api.setAvatar(data)
            } catch {
                photoError = error.localizedDescription
            }
        }
    }

    private func signIn() {
        guard !username.isEmpty, !password.isEmpty else { return }
        working = true
        Task {
            defer { working = false }
            do {
                try await api.signIn(username: username, password: password)
                password = ""
                signInError = nil
            } catch {
                signInError = error.localizedDescription
            }
        }
    }
}

/// The wordmark, what MOX is in two lines, who made it, and the version.
/// The wordmark's black is transparent, so it sits on the page with no box.
struct AboutView: View {
    @Environment(\.openURL) private var openURL

    private var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return b.map { "\(v) (\($0))" } ?? v
    }

    var body: some View {
        VStack(spacing: 14) {
            Image("Wordmark")
                .resizable()
                .scaledToFit()
                .frame(width: 170)
                .accessibilityLabel("MOX")
            Text("Your entertainment, organized: what reached the services you pay for, when your shows' new episodes land, and what's worth watching tonight — in one place.")
                .font(.sora(14))
                .foregroundStyle(Theme.paper.opacity(0.85))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Made for Egypt, in Cairo time. No ads, and no algorithm deciding for you — it ranks by what you told it.")
                .font(.sora(12.5))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                if let url = URL(string: "https://mosama.me") { openURL(url) }
            } label: {
                Text("Developed by **mosama.me**").font(.sora(13)).foregroundStyle(Theme.green)
            }
            .buttonStyle(.plain)
            Text("Version \(version)").font(.sora(11.5)).foregroundStyle(Theme.faint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 12)
    }
}
