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

/// Green light caught in the screen's glass, like a prism at its edge: the
/// glass's rim lit hardest at the top corner and split, the way a prism splits
/// light, into a white-mint core, green, and a thin teal and lime either side;
/// it dies away along both edges, leaves a dark gap, and a soft glow has
/// spilled into the app beyond it.
/// The iPhone's alone: on an iPad it never sat right, and was taken off.
struct CornerGlow: View {
    /// Breathing: the light dims a little and comes back, slowly.
    @State private var dim = false
    /// The screen's own corner, near enough on every current iPhone.
    private let radius: CGFloat = 56
    private let teal = Color(hex: 0x5EEAD4)
    private let lime = Color(hex: 0xBEF264)

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            // Along the edges from the corner: whole at the corner, half by a
            // quarter of the way, gone a little past halfway.
            let stops: [Gradient.Stop] = [.init(color: .white, location: 0), .init(color: .white.opacity(0.85), location: 0.12),
                                          .init(color: .white.opacity(0.35), location: 0.35), .init(color: .clear, location: 0.62)]
            ZStack {
                Color.black
                // The glow inside, set in from the corner so there is a gap
                // between it and the edge.
                RadialGradient(colors: [Theme.green.opacity(0.15), Theme.green.opacity(0.05), .clear],
                               center: UnitPoint(x: 0.3, y: 0.2), startRadius: 0, endRadius: max(w, h) * 0.38)
                    .mask(RadialGradient(colors: [.clear, .clear, .white], center: .topLeading,
                                         startRadius: 0, endRadius: 240))
                rimLight(w: w, h: h, stops: stops)
            }
            .frame(width: w, height: h)
            .onAppear {
                withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) { dim = true }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private func rimLight(w: CGFloat, h: CGFloat, stops: [Gradient.Stop]) -> some View {
                ZStack {
                    // Bloom: the light the rim throws into the glass.
                    rim(inset: 0, width: 26, color: Theme.green.opacity(0.45)).blur(radius: 22)
                    rim(inset: 0, width: 10, color: Theme.green.opacity(0.9)).blur(radius: 6)
                    // The split: lime outside, the white-mint core, teal inside.
                    rim(inset: 0, width: 1.5, color: lime.opacity(0.55)).blur(radius: 0.6)
                    rim(inset: 1.5, width: 1.6, color: Color(hex: 0xECFDF5)).blur(radius: 0.5)
                    rim(inset: 3.5, width: 1.4, color: teal.opacity(0.7)).blur(radius: 0.8)
                    rim(inset: 6, width: 2, color: Theme.green.opacity(0.35)).blur(radius: 1.5)
                }
                .mask { EllipticalGradient(stops: stops, center: .topLeading, startRadiusFraction: 0, endRadiusFraction: 1) }
                .opacity(dim ? 0.7 : 1)
                // A white highlight where the glass curves round the corner.
                rim(inset: 0.5, width: 2.5, color: .white)
                    .blur(radius: 0.6)
                    .mask(RadialGradient(colors: [.white, .white.opacity(0.6), .clear], center: UnitPoint(x: 26 / w, y: 26 / h), startRadius: 0, endRadius: 120))
    }

    /// A band of the given width just inside the screen's edge.
    private func rim(inset: CGFloat, width: CGFloat, color: Color) -> some View {
        RoundedRectangle(cornerRadius: radius - inset)
            .inset(by: inset)
            .strokeBorder(color, lineWidth: width)
    }
}
