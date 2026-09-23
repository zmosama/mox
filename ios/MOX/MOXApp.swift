import SwiftUI
import UserNotifications

@main
struct MOXApp: App {
    @State private var settings: AppSettings
    @State private var api: API
    @State private var calendar = CalendarStore()
    @State private var router: Router
    @State private var notifier = Notifier()
    @Environment(\.scenePhase) private var phase
    /// Static: the notification centre holds its delegate weakly.
    private static let opener = NotificationOpener()

    init() {
        let settings = AppSettings()
        let router = Router()
        _settings = State(initialValue: settings)
        _api = State(initialValue: API(settings: settings))
        _router = State(initialValue: router)
        // Before the first screen: a tap on a notification may be what launched us.
        Self.opener.open = { router.title = $0 }
        UNUserNotificationCenter.current().delegate = Self.opener
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(api)
                .environment(calendar)
                .environment(router)
                .environment(notifier)
                .preferredColorScheme(.dark)
                .tint(Theme.green)
        }
        .onChange(of: phase) {
            switch phase {
            case .active: Task { await notifier.refresh(api: api, settings: settings) }
            case .background: notifier.scheduleBackgroundRefresh()
            default: break
            }
        }
        .backgroundTask(.appRefresh(Notifier.refreshTask)) {
            await notifier.refresh(api: api, settings: settings, force: true)
            await notifier.scheduleBackgroundRefresh()
        }
    }
}

/// Which sheets are up. Any screen can open a title or Settings.
@Observable
final class Router {
    var title: TitleRef?
    var person: PersonRef?
    var settings = false
}

enum AppTab: Hashable {
    case tasks, today, home, library, calendar
}

struct RootView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(API.self) private var api
    @Environment(Router.self) private var router
    @State private var tab: AppTab = .home

    var body: some View {
        @Bindable var router = router

        TabView(selection: $tab) {
            if settings.tasksTab {
                Tab("Tasks", systemImage: "checklist", value: AppTab.tasks) { TasksView() }
            }
            Tab("Today", systemImage: "sparkles.tv", value: AppTab.today) { TodayView() }
            // The ring in its own colours, and no label: the logo is the name.
            Tab(value: AppTab.home) {
                HomeView()
            } label: {
                Image("TabRing").renderingMode(.original).accessibilityLabel("MOX")
            }
            Tab("My List", systemImage: "bookmark", value: AppTab.library) { LibraryView() }
            if settings.calendarTab {
                Tab("Calendar", systemImage: "calendar", value: AppTab.calendar) { CalendarTabView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .sheet(item: $router.title) { ref in
            TitleSheet(ref: ref)
        }
        .sheet(item: $router.person) { ref in
            PersonSheet(id: ref.id)
        }
        .sheet(isPresented: $router.settings) {
            SettingsView()
        }
        .onChange(of: settings.tasksTab) { if !settings.tasksTab && tab == .tasks { tab = .home } }
        .onChange(of: settings.calendarTab) { if !settings.calendarTab && tab == .calendar { tab = .home } }
    }
}
