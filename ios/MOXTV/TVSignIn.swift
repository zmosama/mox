import SwiftUI
import CoreImage.CIFilterBuiltins

/// The code an Apple TV shows while it waits to be signed in.
nonisolated struct TVCode: Decodable, Sendable {
    let code: String
    let secret: String
    let expiresIn: Int
}

private nonisolated struct TVPoll: Decodable, Sendable {
    let state: String
}

extension API {
    func tvStart() async throws -> TVCode {
        var request = URLRequest(url: try url("/api/auth/tv/start"))
        request.httpMethod = "POST"
        return try await send(request)
    }

    /// "waiting", "approved" or "expired". An approval arrives with the
    /// session cookie, which URLSession keeps, as it does on the phone.
    func tvPoll(_ secret: String) async throws -> String {
        var request = URLRequest(url: try url("/api/auth/tv/poll"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["secret": secret])
        let poll: TVPoll = try await send(request)
        return poll.state
    }

    /// The server has just signed this TV in: load everything as that account.
    func tvSignedIn() async {
        forget()
        await refreshUser()
        touch()
    }
}

/// No password typed with a remote: scan the code with a phone that is signed
/// in to MOX, approve there, and the TV signs itself in.
struct TVSignIn: View {
    @Environment(API.self) private var api
    let serverProblem: String?

    @State private var code: TVCode?
    @State private var problem: String?
    /// Bumped to ask for a fresh code.
    @State private var attempt = 0

    var body: some View {
        HStack(spacing: 90) {
            VStack(alignment: .leading, spacing: 28) {
                Text("m\(Text("o").foregroundStyle(TV.green))x").foregroundStyle(TV.paper)
                Text("Sign in with your phone")
                    .font(.system(size: 58, weight: .bold))
                    .foregroundStyle(TV.paper)
                VStack(alignment: .leading, spacing: 18) {
                    step(1, "Point your phone's camera at the code.")
                    step(2, "Sign in to MOX there, if it asks.")
                    step(3, "Press “Sign this Apple TV in”.")
                }
                if let code {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Or open \(address) and type")
                            .font(.system(size: 26))
                            .foregroundStyle(TV.muted)
                        Text(spaced(code.code))
                            .font(.system(size: 64, weight: .semibold, design: .monospaced))
                            .foregroundStyle(TV.green)
                    }
                    .padding(.top, 10)
                }
                if let problem = problem ?? serverProblem {
                    Text(problem)
                        .font(.system(size: 26))
                        .foregroundStyle(.orange)
                    Button("Try again") { attempt += 1 }
                }
            }
            .font(.system(size: 44, weight: .heavy))
            .frame(maxWidth: 820, alignment: .leading)

            Group {
                if let code, let image = qr(link(code.code)) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .padding(28)
                        .background(.white, in: .rect(cornerRadius: 28))
                        .accessibilityLabel("QR code to sign in")
                } else {
                    ProgressView()
                }
            }
            .frame(width: 520, height: 520)
        }
        .padding(TV.edge)
        .task(id: attempt) { await run() }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            Text("\(n)")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(TV.ink)
                .frame(width: 44, height: 44)
                .background(TV.green, in: .circle)
            Text(text)
                .font(.system(size: 31))
                .foregroundStyle(TV.paper)
        }
    }

    /// Ask for a code, then ask every few seconds whether it was approved;
    /// when a code runs out, ask for another, so the screen is never stale.
    private func run() async {
        while !Task.isCancelled {
            do {
                let fresh = try await api.tvStart()
                code = fresh
                problem = nil
                let deadline = Date.now.addingTimeInterval(TimeInterval(fresh.expiresIn))
                while !Task.isCancelled, Date.now < deadline {
                    try await Task.sleep(for: .seconds(3))
                    let state = try await api.tvPoll(fresh.secret)
                    if state == "approved" { await api.tvSignedIn(); return }
                    if state == "expired" { break }
                }
            } catch is CancellationError {
                return
            } catch {
                code = nil
                problem = "Can't reach MOX: \(error.localizedDescription)"
                return
            }
        }
    }

    private var address: String {
        guard let url = try? api.url("/tv"), let host = url.host() else { return "MOX" }
        return host + (url.port.map { ":\($0)" } ?? "") + "/tv"
    }

    private func link(_ code: String) -> String {
        (try? api.url("/tv", ["code": code]).absoluteString) ?? ""
    }

    private func spaced(_ code: String) -> String {
        code.count == 6 ? "\(code.prefix(3)) \(code.suffix(3))" : code
    }

    private func qr(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage,
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
