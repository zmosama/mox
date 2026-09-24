import SwiftUI

/// Which tabs sit either side of the ring, and in what order. Saved to the
/// account, so the website's bar follows; signed out, it stays on this phone.
struct TabsSettingsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(API.self) private var api
    @Environment(CalendarStore.self) private var calendar
    @State private var saveError: String?

    var body: some View {
        List {
            Section {
                ForEach(settings.tabs) { id in
                    Label(id.label, systemImage: id.icon)
                }
                .onMove { from, to in
                    var tabs = settings.tabs
                    tabs.move(fromOffsets: from, toOffset: to)
                    update(tabs)
                }
                .onDelete { offsets in
                    var tabs = settings.tabs
                    tabs.remove(atOffsets: offsets)
                    guard !tabs.isEmpty else { return }
                    update(tabs)
                }
            } header: {
                Text("In the bar")
            } footer: {
                Text("Drag to reorder. The first \((settings.tabs.count + 1) / 2) sit left of the ring, the rest to its right. Up to \(TabID.slots).")
            }

            let unused = TabID.allCases.filter { !settings.tabs.contains($0) }
            if !unused.isEmpty {
                Section {
                    ForEach(unused) { id in
                        Button {
                            Task { await add(id) }
                        } label: {
                            Label(id.label, systemImage: id.icon)
                        }
                        .disabled(settings.tabs.count >= TabID.slots)
                    }
                } header: {
                    Text("Add")
                } footer: {
                    if settings.tabs.count >= TabID.slots {
                        Text("The bar is full. Remove one to add another.")
                    } else {
                        Text("Calendar and Tasks read this iPhone's own calendars and reminders, so they ask first — and they only appear in the app.")
                    }
                }
            }

            if let saveError {
                Text(saveError).font(.footnote).foregroundStyle(.red)
            }
        }
        .environment(\.editMode, .constant(.active))
        .scrollContentBackground(.hidden)
        .background(Theme.ink)
        .navigationTitle("Tabs")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func add(_ id: TabID) async {
        guard settings.tabs.count < TabID.slots else { return }
        switch id {
        case .calendar: guard await calendar.requestEvents() else { return }
        case .tasks: guard await calendar.requestReminders() else { return }
        default: break
        }
        update(settings.tabs + [id])
    }

    /// The bar changes at once; the account follows, and its answer wins.
    private func update(_ tabs: [TabID]) {
        settings.tabs = tabs
        guard api.user != nil else { return }
        Task {
            do {
                let saved = try await api.savePrefs(["tabs": tabs.map(\.rawValue)])
                if !saved.tabIDs.isEmpty { settings.tabs = saved.tabIDs }
                saveError = nil
            } catch {
                saveError = "Couldn't save to your account — the change is on this phone only."
            }
        }
    }
}
