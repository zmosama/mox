import SwiftUI

/// The identity board's palette and type, in one place.
enum Theme {
    static let ink = Color(hex: 0x0B0F0E)
    static let surface = Color(hex: 0x1F2422)
    static let raised = Color(hex: 0x161B19)
    static let green = Color(hex: 0x00D084)
    static let mint = Color(hex: 0xA7F3D0)
    static let paper = Color(hex: 0xF8FAF8)
    static let muted = Color(hex: 0xF8FAF8).opacity(0.55)
    static let faint = Color(hex: 0xF8FAF8).opacity(0.3)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension Font {
    /// Sora, the brand face. Scales with Dynamic Type relative to `style`.
    static func sora(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: TextStyle = .body) -> Font {
        let name = switch weight {
        case .bold, .heavy, .black: "Sora-Bold"
        case .semibold: "Sora-SemiBold"
        case .medium: "Sora-Medium"
        default: "Sora-Regular"
        }
        return .custom(name, size: size, relativeTo: style)
    }
}

/// A section heading, the same everywhere.
struct SectionTitle: View {
    let text: String
    var detail: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text)
                .font(.sora(20, .semibold, relativeTo: .title3))
                .foregroundStyle(Theme.paper)
            if let detail {
                Text(detail)
                    .font(.sora(13, relativeTo: .footnote))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
    }
}

extension View {
    /// A round glass button face at exactly `size` points. The system glass
    /// button style pads its label, which made 42pt icons draw at 60pt+ next to
    /// a 42pt Play button; this keeps the size you ask for.
    func glassCircle(_ size: CGFloat, tint: Color? = nil) -> some View {
        frame(width: size, height: size)
            .contentShape(.circle)
            .glassEffect(tint.map { .regular.tint($0).interactive() } ?? .regular.interactive(), in: .circle)
    }
}

/// Green light caught in the screen's glass: a fine bright line where the
/// glass meets the frame, and light that melts from the edge into the app —
/// heaviest at the top corner, dying away along both edges — with a soft
/// glow beyond it. (Mohammed chose this, "B", from four drawn side by side.)
struct CornerGlow: View {
    /// The screen's own corner, near enough on every current iPhone.
    private let radius: CGFloat = 56

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            // Along the edges from the corner: whole at the corner, gone a
            // little past halfway across and a third of the way down.
            let fade = EllipticalGradient(
                stops: [.init(color: .white, location: 0), .init(color: .white.opacity(0.85), location: 0.12),
                        .init(color: .white.opacity(0.35), location: 0.35), .init(color: .clear, location: 0.62)],
                center: .topLeading, startRadiusFraction: 0, endRadiusFraction: 1
            )
            ZStack {
                Color.black
                RadialGradient(colors: [Theme.green.opacity(0.18), Theme.green.opacity(0.06), .clear],
                               center: UnitPoint(x: 0.26, y: 0.18), startRadius: 0, endRadius: max(w, h) * 0.5)
                ZStack {
                    rim(inset: 0, width: 2, color: Theme.mint.opacity(0.75)).blur(radius: 0.5)
                    rim(inset: 0, width: 14, color: Theme.green.opacity(0.85)).blur(radius: 9)
                    rim(inset: 0, width: 44, color: Theme.green.opacity(0.35)).blur(radius: 28)
                    rim(inset: 0, width: 90, color: Theme.green.opacity(0.12)).blur(radius: 50)
                }
                .mask(fade)
            }
            .frame(width: w, height: h)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    /// A band of the given width just inside the screen's edge.
    private func rim(inset: CGFloat, width: CGFloat, color: Color) -> some View {
        RoundedRectangle(cornerRadius: radius - inset)
            .inset(by: inset)
            .strokeBorder(color, lineWidth: width)
    }
}
