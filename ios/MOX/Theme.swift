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
