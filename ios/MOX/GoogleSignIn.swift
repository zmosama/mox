import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

/// "Continue with Google", without Google's SDK.
///
/// Google's sign-in page opens in the system's secure browser sheet, hands back
/// a one-time code, and the code is exchanged — with a PKCE verifier only this
/// app knows — for an ID token. The server checks that token with Google
/// itself. An iOS client has no secret, so there is none in the app to leak.
@MainActor
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    /// The iOS client in the "MOX App" Google Cloud project. Public, not a secret.
    static let clientID = "871368686092-ie3oti6d5fvm0t3l2cebh781pnavok4c.apps.googleusercontent.com"
    /// Google's reversed client ID: the scheme it is allowed to redirect an iOS client to.
    static let scheme = "com.googleusercontent.apps.871368686092-ie3oti6d5fvm0t3l2cebh781pnavok4c"
    static let redirect = "\(scheme):/oauth2redirect"

    private var session: ASWebAuthenticationSession?

    enum Failure: LocalizedError {
        case cancelled, refused(String)
        var errorDescription: String? {
            switch self {
            case .cancelled: "Sign-in was cancelled."
            case .refused(let why): why
            }
        }
    }

    /// The ID token for whoever signs in, or throws.
    func idToken() async throws -> String {
        let verifier = Self.random(48)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = Self.random(16)

        var auth = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        auth.queryItems = [
            .init(name: "client_id", value: Self.clientID),
            .init(name: "redirect_uri", value: Self.redirect),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "openid email profile"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
            .init(name: "prompt", value: "select_account"),
        ]

        let callback: URL = try await withCheckedThrowingContinuation { done in
            let session = ASWebAuthenticationSession(url: auth.url!, callback: .customScheme(Self.scheme)) { url, error in
                if let url { done.resume(returning: url) }
                else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { done.resume(throwing: Failure.cancelled) }
                else { done.resume(throwing: error ?? Failure.cancelled) }
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
        session = nil

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value
        else { throw Failure.refused(items.first(where: { $0.name == "error" })?.value ?? "Google did not sign you in.") }

        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "content-type")
        var form = URLComponents()
        form.queryItems = [
            .init(name: "client_id", value: Self.clientID),
            .init(name: "code", value: code),
            .init(name: "code_verifier", value: verifier),
            .init(name: "grant_type", value: "authorization_code"),
            .init(name: "redirect_uri", value: Self.redirect),
        ]
        request.httpBody = Data((form.percentEncodedQuery ?? "").utf8)
        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let token = json?["id_token"] as? String else {
            throw Failure.refused(json?["error_description"] as? String ?? "Google did not sign you in.")
        }
        return token
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }

    private static func random(_ bytes: Int) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        return data.base64URL
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
