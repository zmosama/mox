import QuartzCore
import UIKit

/// Frame timing, printed once a second, for finding jank on a real phone
/// without Instruments (which cannot reach it over Wi-Fi). Off unless the
/// app is launched with `-moxFPS YES`; read it with
/// `devicectl device process launch --console … -moxFPS YES`.
@MainActor
final class FrameMeter: NSObject {
    static let shared = FrameMeter()
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private var frames = 0
    private var slow = 0
    private var worst: CFTimeInterval = 0
    private var started: CFTimeInterval = 0

    func startIfAsked() {
        guard UserDefaults.standard.bool(forKey: "moxFPS"), link == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    @objc private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        if last > 0 {
            let gap = now - last
            frames += 1
            worst = max(worst, gap)
            // Longer than two 120Hz frames: one was missed.
            if gap > 0.0125 { slow += 1 }
        }
        last = now
        if started == 0 { started = now }
        if now - started >= 1 {
            print(String(format: "fps %3d  missed %3d  worst %5.1fms", frames, slow, worst * 1000))
            frames = 0; slow = 0; worst = 0; started = now
        }
    }
}
