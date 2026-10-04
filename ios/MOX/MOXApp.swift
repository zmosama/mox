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
        Self.opener.openTab = { router.tab = .tab($0) }
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

/// Which sheets are up, and which tab. Any screen can open a title or
/// Settings; a notification can open a tab.
@Observable
final class Router {
    var title: TitleRef?
    var person: PersonRef?
    var settings = false
    var tab: AppTab = .home
}

/// The ring, or one of the account's tabs.
enum AppTab: Hashable {
    case home
    case tab(TabID)
}

struct RootView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(AppSettings.self) private var settings
    @Environment(API.self) private var api
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router
        // Your tabs either side of the ring, in your order; the ring never moves.
        let tabs = settings.tabs
        let half = (tabs.count + 1) / 2

        TabView(selection: $router.tab) {
            if sizeClass == .regular {
                // iPad: a sidebar with room for everything — home first, your
                // tabs, then the rest. Calendar and Tasks only once chosen, as
                // they ask for the iPad's calendars and reminders.
                Tab(value: AppTab.home) {
                    HomeView()
                } label: {
                    Label { Text("Home") } icon: { Image("TabRing").renderingMode(.original) }
                }
                ForEach(tabs) { id in
                    Tab(id.label, systemImage: id.icon, value: AppTab.tab(id)) { screen(id) }
                }
                TabSection("More") {
                    ForEach(TabID.allCases.filter { !tabs.contains($0) && !$0.needsDevice }) { id in
                        Tab(id.label, systemImage: id.icon, value: AppTab.tab(id)) { screen(id) }
                    }
                }
            } else {
                ForEach(Array(tabs.prefix(half))) { id in
                    Tab(id.label, systemImage: id.icon, value: AppTab.tab(id)) { screen(id) }
                }
                // The ring in its own colours, and no label: the logo is the name.
                Tab(value: AppTab.home) {
                    HomeView()
                } label: {
                    Image("TabRing").renderingMode(.original).accessibilityLabel("MOX")
                }
                ForEach(Array(tabs.dropFirst(half))) { id in
                    Tab(id.label, systemImage: id.icon, value: AppTab.tab(id)) { screen(id) }
                }
            }
        }
        // On an iPad the tabs can open as a sidebar; on an iPhone this is the
        // ordinary tab bar.
        .tabViewStyle(.sidebarAdaptable)
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
        #if DEBUG
        // Screenshots: `simctl launch … -moxTab studios` opens on that tab.
        .onAppear {
            if let raw = UserDefaults.standard.string(forKey: "moxTab"), let id = TabID(rawValue: raw) { router.tab = .tab(id) }
        }
        #endif
        // The account's tabs, from the server, whenever who is signed in changes.
        .task(id: api.user?.id) {
            guard api.user != nil, let prefs = try? await api.prefs(), !prefs.tabIDs.isEmpty else { return }
            settings.tabs = prefs.tabIDs
        }
        .onChange(of: settings.tabs) {
            if sizeClass != .regular, case .tab(let id) = router.tab, !settings.tabs.contains(id) { router.tab = .home }
        }
    }

    @ViewBuilder
    private func screen(_ id: TabID) -> some View {
        switch id {
        case .today: TodayView()
        case .news: NewsView()
        case .library: LibraryView()
        case .picks: PicksView()
        case .studios: StudiosView()
        case .friends: FriendsView()
        case .f1: F1View()
        case .calendar: CalendarTabView()
        case .tasks: TasksView()
        }
    }
}
