import EventKit
import Observation

/// The phone's own calendars and reminders, through EventKit.
///
/// This is what makes the sync two-way for free: whatever accounts are on the
/// iPhone (iCloud, Google, Outlook) are read and written directly, so an event
/// added in MOX is in Google Calendar, and one added there shows up here.
@Observable
final class CalendarStore {
    let store = EKEventStore()
    private(set) var eventsAccess = EKEventStore.authorizationStatus(for: .event)
    private(set) var remindersAccess = EKEventStore.authorizationStatus(for: .reminder)
    /// Bumped whenever the store reports a change, so screens reload.
    private(set) var revision = 0

    init() {
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.revision += 1 }
        }
    }

    var canReadEvents: Bool { eventsAccess == .fullAccess }
    var canReadReminders: Bool { remindersAccess == .fullAccess }

    @discardableResult
    func requestEvents() async -> Bool {
        _ = try? await store.requestFullAccessToEvents()
        eventsAccess = EKEventStore.authorizationStatus(for: .event)
        return canReadEvents
    }

    @discardableResult
    func requestReminders() async -> Bool {
        _ = try? await store.requestFullAccessToReminders()
        remindersAccess = EKEventStore.authorizationStatus(for: .reminder)
        return canReadReminders
    }

    func events(from start: Date, days: Int) -> [EKEvent] {
        guard canReadEvents else { return [] }
        let end = Calendar.current.date(byAdding: .day, value: days, to: start)!
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        return store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
    }

    func todaysEvents() -> [EKEvent] {
        events(from: Calendar.current.startOfDay(for: .now), days: 1)
    }

    func openReminders() async -> [EKReminder] {
        guard canReadReminders else { return [] }
        let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
        // EventKit hands the reminders back on its own queue; they are only read
        // here once it is done with them.
        let found = await withCheckedContinuation { (done: CheckedContinuation<Reminders, Never>) in
            store.fetchReminders(matching: predicate) { done.resume(returning: Reminders(list: $0 ?? [])) }
        }.list
        return found.sorted {
            ($0.dueDateComponents?.date ?? .distantFuture) < ($1.dueDateComponents?.date ?? .distantFuture)
        }
    }

    private struct Reminders: @unchecked Sendable { let list: [EKReminder] }

    func complete(_ reminder: EKReminder) {
        reminder.isCompleted = true
        try? store.save(reminder, commit: true)
    }

    func addReminder(_ title: String) {
        guard let list = store.defaultCalendarForNewReminders() else { return }
        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.calendar = list
        try? store.save(reminder, commit: true)
    }
}
