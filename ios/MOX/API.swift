import Foundation
import Observation
import UIKit

enum APIError: LocalizedError {
    case status(Int, String?)
    case badServer

    var errorDescription: String? {
        switch self {
        case .status(401, _): "Sign in first."
        case .status(_, let message?): message
        case .status(let code, nil): "The server answered \(code)."
        case .badServer: "The server address in Settings is not a valid URL."
        }
    }
}

/// Talks to the mox Next.js server. The session is the same cookie the website
/// uses, kept by URLSession's shared cookie store across launches.
@Observable
final class API {
    private(set) var user: User?
    /// Bumped after anything that changes what the lists would show, so open
    /// screens know to reload.
    private(set) var revision = 0

    private let session = URLSession.shared
    private let decoder = JSONDecoder()
    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
    }

    private func url(_ path: String, _ query: [String: String] = [:]) throws -> URL {
        guard var parts = URLComponents(string: settings.server.trimmingCharacters(in: .whitespaces)),
              parts.scheme != nil else { throw APIError.badServer }
        parts.path = (parts.path.hasSuffix("/") ? String(parts.path.dropLast()) : parts.path) + path
        if !query.isEmpty { parts.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = parts.url else { throw APIError.badServer }
        return url
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.status(code, message)
        }
        return try decoder.decode(T.self, from: data)
    }

    func get<T: Decodable>(_ path: String, _ query: [String: String] = [:]) async throws -> T {
        var request = URLRequest(url: try url(path, query))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await send(request)
    }

    @discardableResult
    func post(_ path: String, _ body: [String: Any]) async throws -> [String: AnyCodable] {
        var request = URLRequest(url: try url(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    // MARK: - Screens

    func home() async throws -> HomePayload {
        let payload: HomePayload = try await get("/api/app/home")
        user = payload.user
        return payload
    }

    func today() async throws -> TodayPayload { try await get("/api/app/today") }
    func library() async throws -> LibraryPayload { try await get("/api/app/library") }
    func picks() async throws -> PicksPayload { try await get("/api/app/picks") }
    func alerts() async throws -> AlertsPayload { try await get("/api/app/alerts") }
    func news() async throws -> NewsPayload { try await get("/api/news") }
    func f1() async throws -> F1Board { try await get("/api/f1") }
    func f1Round(_ round: Int) async throws -> F1RoundDetail { try await get("/api/f1/round/\(round)") }

    func setF1Watched(season: Int, round: Int, _ watched: Bool) async throws {
        try await post("/api/f1/watched", ["season": season, "round": round, "watched": watched])
    }

    /// Something changed that the open screens should reload for.
    func touch() { revision += 1 }

    func prefs() async throws -> Prefs {
        let payload: PrefsPayload = try await get("/api/account/prefs")
        return payload.prefs
    }

    /// Change some preferences; the answer is all of them, as now stored.
    func savePrefs(_ patch: [String: Any]) async throws -> Prefs {
        var request = URLRequest(url: try url("/api/account/prefs"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: patch)
        let payload: PrefsPayload = try await send(request)
        return payload.prefs
    }
    func title(_ ref: TitleRef) async throws -> TitleDetail { try await get("/api/title/\(ref.kind)/\(ref.tmdbId)") }

    /// Ten titles a page; people come with the first.
    func search(_ query: String, page: Int = 1) async throws -> (titles: [Card], people: [PersonHit], next: Int?) {
        let payload: ResultsPayload = try await get("/api/search", ["q": query, "page": String(page)])
        return (payload.results, payload.people ?? [], payload.next)
    }

    func studios() async throws -> [Studio] {
        let payload: StudiosPayload = try await get("/api/studios")
        return payload.studios
    }

    /// Follow or unfollow a studio; followed ones lead the Studios tab.
    func setFollowing(studio slug: String, _ following: Bool) async throws {
        try await post("/api/studios/follow", ["slug": slug, "following": following])
        revision += 1
    }

    /// One studio's films or series, ten a page. Sort: "popular", "top" or "newest".
    func studio(_ slug: String, kind: String, sort: String, page: Int) async throws -> StudioPage {
        try await get("/api/studios/\(slug)", ["kind": kind, "sort": sort, "page": String(page)])
    }

    func friends() async throws -> [Friend] {
        let payload: FriendsPayload = try await get("/api/friends")
        return payload.friends
    }

    /// People whose name starts with — or contains — what was typed, from the first letter.
    func findPeople(_ typed: String) async throws -> [Friend] {
        let payload: FindPeoplePayload = try await get("/api/friends/search", ["q": typed])
        return payload.people
    }

    /// A suggestion tapped. Both of you see each other's ratings from now on.
    func addFriend(id: Int) async throws -> FriendAdded {
        var request = URLRequest(url: try url("/api/friends"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["id": id])
        let added: FriendAdded = try await send(request)
        revision += 1
        return added
    }

    /// By their username or email. Both of you see each other's ratings from now on.
    func addFriend(_ who: String) async throws -> FriendAdded {
        var request = URLRequest(url: try url("/api/friends"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["who": who])
        let added: FriendAdded = try await send(request)
        revision += 1
        return added
    }

    func removeFriend(_ id: Int) async throws -> [Friend] {
        var request = URLRequest(url: try url("/api/friends"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["id": id])
        let payload: FriendsPayload = try await send(request)
        revision += 1
        return payload.friends
    }

    /// What friends rated lately: all of them or one, every verdict or one.
    func friendActivity(friend: Int?, verdict: String?, page: Int) async throws -> FriendActivityPayload {
        var query = ["page": String(page)]
        if let friend { query["friend"] = String(friend) }
        if let verdict { query["verdict"] = verdict }
        return try await get("/api/friends/activity", query)
    }

    func person(_ id: Int) async throws -> PersonDetail { try await get("/api/person/\(id)") }

    func setFollowing(person: PersonDetail, _ following: Bool) async throws {
        try await post("/api/people/follow", [
            "id": person.id, "name": person.name, "profile": person.profile ?? NSNull(), "following": following,
        ])
        revision += 1
    }

    func discover(mood: String) async throws -> [Card] {
        let payload: ResultsPayload = try await get("/api/app/discover", ["mood": mood])
        return payload.results
    }

    func services() async throws -> [ServiceChoice] {
        let payload: ServicesPayload = try await get("/api/services")
        return payload.services
    }

    func saveServices(_ providerIds: [Int]) async throws {
        try await post("/api/services", ["providerIds": providerIds])
        revision += 1
    }

    func ratingWall() async throws -> [WallItem] {
        let payload: WallPayload = try await get("/api/app/rate")
        return payload.items
    }

    // MARK: - Account

    /// A server path such as the avatar's, made absolute against the server.
    func absolute(_ path: String?) -> URL? {
        // Resolved as a relative URL, not appended to the path: these carry a
        // query (?v=), and put through the path the "?" was escaped to %3F
        // and the server was asked for a file that does not exist.
        guard let path,
              let base = URL(string: settings.server.trimmingCharacters(in: .whitespaces)) else { return nil }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }

    /// Crop to a centred square, shrink to 320px and upload as the profile photo.
    func setAvatar(_ imageData: Data) async throws {
        guard let jpeg = squareJPEG(imageData, side: 320) else { throw APIError.status(400, "That photo couldn't be read.") }
        var request = URLRequest(url: try url("/api/account/avatar"))
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "content-type")
        request.httpBody = jpeg
        let _: [String: AnyCodable] = try await send(request)
        await refreshUser()
    }

    func removeAvatar() async throws {
        var request = URLRequest(url: try url("/api/account/avatar"))
        request.httpMethod = "DELETE"
        let _: [String: AnyCodable] = try await send(request)
        await refreshUser()
    }

    func refreshUser() async {
        _ = try? await home()
    }

    func signIn(username: String, password: String) async throws {
        try await post("/api/auth/login", ["username": username, "password": password])
        await refreshUser()
        revision += 1
    }

    func signUp(name: String, email: String, username: String, password: String) async throws {
        try await post("/api/auth/signup", ["displayName": name, "email": email, "username": username, "password": password])
        await refreshUser()
        revision += 1
    }

    /// Sign in, or make an account, with Google: the server decides which.
    func signInWithGoogle() async throws {
        let token = try await GoogleSignIn().idToken()
        try await post("/api/auth/google", ["idToken": token])
        await refreshUser()
        revision += 1
    }

    func account() async throws -> Account {
        let payload: AccountPayload = try await get("/api/account/me")
        return payload.account
    }

    func changeEmail(_ email: String, password: String?) async throws {
        var body: [String: Any] = ["email": email]
        if let password, !password.isEmpty { body["password"] = password }
        try await post("/api/account/email", body)
    }

    func changePassword(current: String?, next: String) async throws {
        var body: [String: Any] = ["next": next]
        if let current, !current.isEmpty { body["current"] = current }
        try await post("/api/account/password", body)
    }

    /// Deletes the account and everything in it. Signed out afterwards.
    func deleteAccount(password: String?) async throws {
        var request = URLRequest(url: try url("/api/account/me"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        var body: [String: Any] = [:]
        if let password, !password.isEmpty { body["password"] = password }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let _: [String: AnyCodable] = try await send(request)
        user = nil
        revision += 1
    }

    func signOut() async {
        _ = try? await post("/api/auth/logout", [:])
        user = nil
        revision += 1
    }

    // MARK: - Changes

    func setWatched(_ card: Card, _ watched: Bool) async throws {
        guard let season = card.season, let episode = card.episode else { return }
        try await post("/api/watched", ["tmdbId": card.tmdbId, "season": season, "episode": episode, "watched": watched])
        revision += 1
    }

    func season(_ tmdbId: Int, _ season: Int) async throws -> SeriesProgress {
        try await get("/api/title/tv/\(tmdbId)/season/\(season)")
    }

    func setEpisodeWatched(tmdbId: Int, season: Int, episode: Int, _ watched: Bool) async throws {
        try await post("/api/watched", ["tmdbId": tmdbId, "season": season, "episode": episode, "watched": watched])
        revision += 1
    }

    func setVerdict(_ ref: TitleRef, _ verdict: String?) async throws {
        try await post("/api/verdict", ["tmdbId": ref.tmdbId, "kind": ref.kind, "verdict": verdict ?? NSNull()])
        revision += 1
    }

    func setFollowing(_ tmdbId: Int, _ following: Bool) async throws {
        try await post("/api/follow", ["tmdbId": tmdbId, "following": following])
        revision += 1
    }
}

/// Just enough to decode `{ "ok": true, ... }` replies without declaring each.
nonisolated struct AnyCodable: Decodable, Sendable {
    init(from decoder: Decoder) throws {}
}

/// A centred square of the image, `side` pixels across, as JPEG.
private func squareJPEG(_ data: Data, side: CGFloat) -> Data? {
    guard let image = UIImage(data: data) else { return nil }
    let size = image.size
    let edge = min(size.width, size.height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let rendered = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
        let scale = side / edge
        let drawn = CGSize(width: size.width * scale, height: size.height * scale)
        image.draw(in: CGRect(x: (side - drawn.width) / 2, y: (side - drawn.height) / 2, width: drawn.width, height: drawn.height))
    }
    return rendered.jpegData(compressionQuality: 0.86)
}
