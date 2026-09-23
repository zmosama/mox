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
    func title(_ ref: TitleRef) async throws -> TitleDetail { try await get("/api/title/\(ref.kind)/\(ref.tmdbId)") }

    func search(_ query: String) async throws -> (titles: [Card], people: [PersonHit]) {
        let payload: ResultsPayload = try await get("/api/search", ["q": query])
        return (payload.results, payload.people ?? [])
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
