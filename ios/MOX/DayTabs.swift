import EventKit
import EventKitUI
import SwiftUI

/// The optional Calendar tab: the week ahead from the phone's calendars.
struct CalendarTabView: View {
    @Environment(CalendarStore.self) private var calendar
    @State private var events: [EKEvent] = []
    @State private var adding = false

    private var days: [(Date, [EKEvent])] {
        let grouped = Dictionary(grouping: events) { Calendar.current.startOfDay(for: $0.startDate) }
        return grouped.keys.sorted().map { ($0, grouped[$0]!) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                HStack {
                    Text("Calendar").font(.sora(28, .bold, relativeTo: .title)).foregroundStyle(Theme.paper)
                    Spacer()
                    Button { adding = true } label: {
                        Image(systemName: "plus").font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .glassCircle(40, tint: Theme.green)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("New event")
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                if !calendar.canReadEvents {
                    Text("Allow calendar access in Settings to see your week.")
                        .font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                } else if events.isEmpty {
                    Text("Nothing in the next seven days.")
                        .font(.sora(14)).foregroundStyle(Theme.muted).padding(.horizontal, 20)
                }

                ForEach(days, id: \.0) { day, list in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(day.formatted(.dateTime.weekday(.wide).day().month()))
                            .font(.sora(14, .semibold))
                            .foregroundStyle(Calendar.current.isDateInToday(day) ? Theme.green : Theme.muted)
                        ForEach(list, id: \.eventIdentifier) { event in
                            HStack(spacing: 12) {
                                RoundedRectangle(cornerRadius: 2).fill(Color(cgColor: event.calendar.cgColor)).frame(width: 3, height: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(event.title ?? "Event").font(.sora(15, .medium)).foregroundStyle(Theme.paper)
                                    Text(event.isAllDay ? "All day" : "\(event.startDate.formatted(date: .omitted, time: .shortened)) – \(event.endDate.formatted(date: .omitted, time: .shortened))")
                                        .font(.sora(12)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                            }
                            .padding(12)
                            .background(Theme.raised, in: .rect(cornerRadius: 16))
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .task(id: calendar.revision) { reload() }
        .sheet(isPresented: $adding) {
            EventEditor(store: calendar.store).ignoresSafeArea()
        }
    }

    private func reload() {
        events = calendar.events(from: Calendar.current.startOfDay(for: .now), days: 7)
    }
}

/// Apple's own event editor, so a new event goes to whichever calendar you pick.
struct EventEditor: UIViewControllerRepresentable {
    let store: EKEventStore
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let editor = EKEventEditViewController()
        editor.eventStore = store
        editor.editViewDelegate = context.coordinator
        return editor
    }

    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(dismiss: dismiss) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let dismiss: DismissAction
        init(dismiss: DismissAction) { self.dismiss = dismiss }

        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            dismiss()
        }
    }
}

/// The optional Tasks tab: your Reminders, so they stay in sync with Apple's app.
struct TasksView: View {
    @Environment(CalendarStore.self) private var calendar
    @State private var reminders: [EKReminder] = []
    @State private var draft = ""

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                Text("Tasks")
                    .font(.sora(28, .bold, relativeTo: .title))
                    .foregroundStyle(Theme.paper)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                HStack {
                    TextField("", text: $draft, prompt: Text("Add a task").foregroundStyle(Theme.muted))
                        .font(.sora(15))
                        .onSubmit(add)
                    Button(action: add) { Image(systemName: "plus.circle.fill").font(.title2) }
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityLabel("Add task")
                }
                .padding(.horizontal, 16)
                .frame(height: 50)
                .glassEffect(.regular.interactive(), in: .capsule)

                if !calendar.canReadReminders {
                    Text("Allow Reminders access in Settings to see your tasks.")
                        .font(.sora(14)).foregroundStyle(Theme.muted)
                }

                ForEach(reminders, id: \.calendarItemIdentifier) { reminder in
                    HStack(spacing: 12) {
                        Button {
                            calendar.complete(reminder)
                            withAnimation { reminders.removeAll { $0 == reminder } }
                        } label: {
                            Image(systemName: "circle").font(.title3).foregroundStyle(Theme.green)
                        }
                        .accessibilityLabel("Complete \(reminder.title ?? "task")")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(reminder.title ?? "Task").font(.sora(15)).foregroundStyle(Theme.paper)
                            if let due = reminder.dueDateComponents?.date {
                                Text(due.formatted(date: .abbreviated, time: .omitted)).font(.sora(12)).foregroundStyle(Theme.muted)
                            }
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(Theme.raised, in: .rect(cornerRadius: 16))
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 48)
        }
        .background(Theme.ink)
        .task(id: calendar.revision) { reminders = await calendar.openReminders() }
    }

    private func add() {
        let title = draft.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        calendar.addReminder(title)
        draft = ""
    }
}
