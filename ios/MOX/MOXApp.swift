import SwiftUI

@main
struct MOXApp: App {
    @State private var settings: AppSettings
    @State private var api: API
    @State private var calendar = CalendarStore()
    @State private var router = Router()

    init() {
        let settings = AppSettings()
        _settings = State(initialValue: settings)
        _api = State(initialValue: API(settings: settings))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(api)
                .environment(calendar)
                .environment(router)
                .preferredColorScheme(.dark)
                .tint(Theme.green)
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
