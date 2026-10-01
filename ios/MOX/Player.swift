import SwiftUI
import WebKit

/// Opens a title on a service — on the title's own page where it can be found,
/// on a search otherwise.
///
/// The server sends two things for each service: `url`, a verified search that
/// always works, and `find`, a DuckDuckGo `!ducky` lookup limited to the
/// service's domain that usually lands on the title's own page. The lookup has
/// to run here, in a real WebKit on the phone: fetched by a server, DuckDuckGo
/// answers with a bot challenge. So it runs in a web view nobody sees, and the
/// result is opened as a normal link — which iOS hands to the service's app.
///
/// Nothing is opened unless it passes `accept`, the same rule as `accepted()`
/// in src/lib/play-links.ts, where it is tested against real landings. Anything
/// else — a wrong film, a home page, a timeout, no network — opens the search.
@MainActor
enum Player {
    static func open(_ platform: Platform, with openURL: OpenURLAction) async {
        if let find = platform.find, let page = await Finder.page(for: find) {
            openURL(page)
            return
        }
        if let s = platform.url, let url = URL(string: s) { openURL(url) }
    }
}

/// One lookup: load the `!ducky` URL and watch where it goes.
@MainActor
private final class Finder: NSObject, WKNavigationDelegate {
    private let find: Find
    private let web: WKWebView
    private var done: CheckedContinuation<URL?, Never>?

    /// Long enough for DuckDuckGo's redirect and the service's own, short
    /// enough that a tap that is going to fail falls back while it still feels
    /// like an answer.
    private static let timeout: Duration = .seconds(6)

    private init(_ find: Find) {
        self.find = find
        web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: .init())
        super.init()
        web.navigationDelegate = self
    }

    static func page(for find: Find) async -> URL? {
        guard let start = URL(string: find.url) else { return nil }
        let finder = Finder(find)
        return await withCheckedContinuation { continuation in
            finder.done = continuation
            finder.web.load(URLRequest(url: start))
            Task { @MainActor in
                try? await Task.sleep(for: timeout)
                finder.finish(nil)
            }
        }
    }

    private func finish(_ url: URL?) {
        guard let done else { return }
        self.done = nil
        web.stopLoading()
        web.navigationDelegate = nil
        done.resume(returning: url)
    }

    // Every navigation, before it happens. The first one that is a title page
    // is the answer; there is no need to let the service's page load at all.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard action.targetFrame?.isMainFrame != false, let url = action.request.url else {
            decisionHandler(.allow)
            return
        }
        if let page = accepted(url) {
            decisionHandler(.cancel)
            finish(page)
        } else {
            decisionHandler(.allow)
        }
    }

    // A page finished loading without ever passing. If it is on the service,
    // DuckDuckGo has already decided and decided wrong — a home page, a list,
    // another film — so give up now rather than wait out the timeout. Still on
    // DuckDuckGo means its redirect simply has not run yet.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url else { return }
        if let page = accepted(url) { finish(page) }
        else if onService(url) { finish(nil) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(nil)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // A navigation we cancelled reports here too; `finish` ignores repeats.
        if (error as NSError).code != NSURLErrorCancelled { finish(nil) }
    }

    private func onService(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return host == find.host || host.hasSuffix("." + find.host)
    }

    /// The page to open, or nil. Mirrors `accepted()` in play-links.ts.
    private func accepted(_ url: URL) -> URL? {
        guard onService(url),
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = parts.percentEncodedPath.removingPercentEncoding ?? parts.percentEncodedPath
        guard let accept = try? NSRegularExpression(pattern: find.accept, options: [.caseInsensitive]),
              accept.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)) != nil else { return nil }

        var out = parts.percentEncodedPath
        for pair in find.rewrite where pair.count == 2 {
            guard let re = try? NSRegularExpression(pattern: pair[0], options: [.caseInsensitive]) else { continue }
            out = re.stringByReplacingMatches(
                in: out, range: NSRange(out.startIndex..., in: out), withTemplate: pair[1])
        }
        parts.percentEncodedPath = out
        parts.fragment = nil
        return parts.url
    }
}
