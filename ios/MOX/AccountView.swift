import SwiftUI

/// Signed out: Google, or a username and password — to sign in or to make an account.
struct SignInSection: View {
    @Environment(API.self) private var api
    @State private var creating = false
    @State private var name = ""
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        Section {
            Button {
                run { try await api.signInWithGoogle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "g.circle.fill").font(.title3)
                    Text("Continue with Google").font(.sora(16, .semibold))
                }
                .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.paper)
            .foregroundStyle(Theme.ink)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            .disabled(working)
        } footer: {
            Text("New here? Google makes your account in one step.")
        }

        Section {
            Picker("", selection: $creating) {
                Text("Sign in").tag(false)
                Text("Create account").tag(true)
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            if creating {
                TextField("Your name", text: $name).textContentType(.name)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            TextField(creating ? "Username" : "Username or email", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: username) { if creating { username = Self.handle(username) } }
            SecureField(creating ? "Password (8+ characters)" : "Password", text: $password)
                .textContentType(creating ? .newPassword : .password)
                .onSubmit(submit)
            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
            Button(action: submit) {
                if working { ProgressView() } else { Text(creating ? "Create account" : "Sign in") }
            }
            .disabled(!ready || working)
        } header: {
            Text("Or with a password")
        } footer: {
            Link("Privacy · Terms", destination: URL(string: "https://mox.mosama.me/privacy")!)
                .font(.footnote)
        }
        .onChange(of: creating) { error = nil }
    }

    private var ready: Bool {
        creating
            ? !email.isEmpty && username.count >= 3 && password.count >= 8
            : !username.isEmpty && !password.isEmpty
    }

    private func submit() {
        guard ready else { return }
        run {
            if creating {
                try await api.signUp(name: name, email: email, username: username, password: password)
            } else {
                try await api.signIn(username: username, password: password)
            }
            password = ""
        }
    }

    private func run(_ action: @escaping () async throws -> Void) {
        working = true
        error = nil
        Task {
            defer { working = false }
            do { try await action() } catch GoogleSignIn.Failure.cancelled {
                // Closing Google's sheet is not an error worth showing.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    /// The same tidying as the website: "Ahmed Fouad" becomes "ahmed_fouad".
    static func handle(_ s: String) -> String {
        let folded = s.folding(options: .diacriticInsensitive, locale: nil).lowercased()
        let cleaned = folded.replacingOccurrences(of: "[^a-z0-9._-]+", with: "_", options: .regularExpression)
            .replacingOccurrences(of: "^[._-]+", with: "", options: .regularExpression)
        return String(cleaned.prefix(32))
    }
}

/// Signed in: who you are, and changing your email, your password, or leaving.
struct AccountView: View {
    @Environment(API.self) private var api
    @Environment(Notifier.self) private var notifier
    @Environment(\.dismiss) private var dismiss
    @State private var account: Account?
    @State private var editing: Edit?
    @State private var loadError: String?

    enum Edit: String, Identifiable {
        case email, password, delete
        var id: String { rawValue }
    }

    var body: some View {
        Form {
            if let account {
                Section {
                    LabeledContent("Username", value: account.username)
                    LabeledContent("Email", value: account.email ?? "None yet")
                    LabeledContent("Signs in with", value: [account.hasPassword ? "Password" : nil, account.google ? "Google" : nil]
                        .compactMap { $0 }.joined(separator: " · "))
                }
                Section {
                    Button(account.email == nil ? "Add email" : "Change email") { editing = .email }
                    Button(account.hasPassword ? "Change password" : "Set a password") { editing = .password }
                } footer: {
                    Text(account.hasPassword
                         ? "Changing your password signs out your other devices."
                         : "Your account was made with Google. Set a password to sign in without it, too.")
                }
                if !account.isOwner {
                    Section {
                        Button("Delete account", role: .destructive) { editing = .delete }
                    } footer: {
                        Text("Deletes your ratings, followed shows, watchlist and everything else in the account.")
                    }
                }
            } else if let loadError {
                Text(loadError).foregroundStyle(.red)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.ink)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $editing) { edit in
            if let account {
                AccountEditView(edit: edit, account: account) { deleted in
                    editing = nil
                    if deleted { notifier.clearAll(); dismiss() } else { Task { await load() } }
                }
            }
        }
    }

    private func load() async {
        do { account = try await api.account() } catch { loadError = error.localizedDescription }
    }
}

private struct AccountEditView: View {
    @Environment(API.self) private var api
    @Environment(\.dismiss) private var dismiss
    let edit: AccountView.Edit
    let account: Account
    let done: (_ deleted: Bool) -> Void

    @State private var value = ""
    @State private var current = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    switch edit {
                    case .email:
                        TextField("New email", text: $value)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    case .password:
                        SecureField("New password (8+ characters)", text: $value).textContentType(.newPassword)
                    case .delete:
                        Text("This deletes your account and everything in it. It cannot be undone.")
                            .foregroundStyle(.red)
                    }
                    if account.hasPassword {
                        SecureField("Current password", text: $current).textContentType(.password)
                    }
                    if let error { Text(error).foregroundStyle(.red).font(.footnote) }
                }
                Section {
                    Button(role: edit == .delete ? .destructive : nil, action: save) {
                        if working { ProgressView() } else { Text(edit == .delete ? "Delete my account" : "Save") }
                    }
                    .disabled(!ready || working)
                }
            }
            .navigationTitle(edit == .email ? "Email" : edit == .password ? "Password" : "Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private var ready: Bool {
        let confirmed = !account.hasPassword || !current.isEmpty
        switch edit {
        case .email: return value.contains("@") && confirmed
        case .password: return value.count >= 8 && confirmed
        case .delete: return confirmed
        }
    }

    private func save() {
        working = true
        error = nil
        Task {
            defer { working = false }
            do {
                switch edit {
                case .email: try await api.changeEmail(value, password: current)
                case .password: try await api.changePassword(current: current, next: value)
                case .delete: try await api.deleteAccount(password: current)
                }
                done(edit == .delete)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
