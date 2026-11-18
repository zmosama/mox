import SwiftUI

/// MOX on Apple TV: what is new for you, and one press to start watching it
/// in the app it is on. The same account and the same server as the phone.
@main
struct MOXTVApp: App {
    @State private var api: API

    init() {
        // `-server http://…` on launch points a test build at a local server,
        // exactly as on the phone: AppSettings reads it from the defaults.
        _api = State(initialValue: API(settings: AppSettings()))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(api)
                .preferredColorScheme(.dark)
        }
    }
}

/// Signed in: Home. Signed out: the code to scan. Until the server has said
/// which, neither — a sign-in screen flashing past on every launch reads as
/// having been signed out.
struct RootView: View {
    @Environment(API.self) private var api
    @State private var asked = false
    @State private var problem: String?

    var body: some View {
        ZStack {
            TV.ink.ignoresSafeArea()
            if api.user != nil {
                TVMain()
            } else if asked {
                TVSignIn(serverProblem: problem)
            } else {
                ProgressView()
            }
        }
        .task(id: api.revision) {
            do {
                _ = try await api.home()
                problem = nil
            } catch {
                problem = error.localizedDescription
            }
            asked = true
        }
    }
}

/// The phone's palette, at television sizes.
enum TV {
    static let ink = Color(red: 0x0B / 255, green: 0x0F / 255, blue: 0x0E / 255)
    static let green = Color(red: 0, green: 0xD0 / 255, blue: 0x84 / 255)
    static let paper = Color(red: 0xF8 / 255, green: 0xFA / 255, blue: 0xF8 / 255)
    static let muted = paper.opacity(0.6)
    /// The margin tvOS keeps clear of a television's overscan.
    static let edge: CGFloat = 80
}

/// A picture from the server or from TMDB, dark until it arrives.
struct TVImage: View {
    @Environment(API.self) private var api
    let path: String?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
            if let image = phase.image {
                image.resizable().aspectRatio(contentMode: contentMode)
            } else {
                Color.white.opacity(0.06)
            }
        }
    }

    private var url: URL? {
        guard let path, !path.isEmpty else { return nil }
        return path.hasPrefix("http") ? URL(string: path) : api.absolute(path)
    }
}
