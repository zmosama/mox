import SwiftUI

/// The ring from the identity board, drawn exactly as supplied, glowing like
/// something charged — a light from inside that swells, surges and throws off
/// waves, rather than a highlight going round.
///
/// Everything is driven by one `energy` value built from slow, unrelated sines
/// (so it never visibly repeats), an occasional sharp surge, and a faint fast
/// shimmer. The ring brightens from within, a bloom in its own shape breathes
/// with it, the corona and the screen-wide light rise and fall together, and
/// waves of light leave the rim, each at its own strength. Nothing reaches the
/// hole: the ring's black centre stays black.
struct LivingRing: View {
    /// Diameter of the ring itself, not of the image around it.
    let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The image is cropped wide enough that its edges are pure black: the
    /// ring's outer edge sits at 59% of its width, and the hole at 64% of the ring.
    private var imageWidth: CGFloat { size / 0.593 }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            let e = reduceMotion ? 0.5 : energy(t)
            ZStack {
                Image("Ring")
                    .resizable()
                    .scaledToFit()
                    .frame(width: imageWidth)

                // Lit from inside: the ring added onto itself brightens it in
                // its own colours, black adding nothing.
                Image("Ring")
                    .resizable()
                    .scaledToFit()
                    .frame(width: imageWidth)
                    .opacity(0.22 * e)
                    .blendMode(.plusLighter)

                Group {
                    // A bloom in the ring's own shape, not a generic circle.
                    Image("Ring")
                        .resizable()
                        .scaledToFit()
                        .frame(width: imageWidth)
                        .blur(radius: size * 0.09)
                        .opacity(0.25 + 0.75 * e)

                    glow(t, e)
                }
                .mask(outsideTheHole)
                .blendMode(.plusLighter)

                ambient
                    .opacity(0.6 + 0.5 * e)
                    .blendMode(.plusLighter)
            }
            .allowsHitTesting(false)
        }
        // Lay out around the ring and its near glow; the black margin of the
        // image and the wide light spill over the screen without taking space.
        .frame(width: size * 1.25, height: size * 1.25)
        .accessibilityHidden(true)
    }

    /// How charged the ring is right now, about 0...1.2.
    private func energy(_ t: Double) -> Double {
        // Slow on purpose: a breath takes the better part of a minute to come
        // round, and a surge a few seconds to rise and settle.
        let breath = 0.5 + 0.5 * noise(t * 0.45, 2.3)
        // Mostly nothing, now and then a swell.
        let surge = pow(max(0, noise(t * 0.3, 4.4)), 3) * 3
        // A faint, slow waver — not a flicker.
        let waver = (sin(t * 1.7) + sin(t * 2.9 + 1.3)) / 2 * 0.03
        return min(max(0.3 + 0.35 * breath + 0.5 * min(surge, 1) + waver, 0), 1.2)
    }

    /// A second, much wider and fainter light that washes the whole screen.
    ///
    /// Drawn per pixel by `moxAmbient` (Ambient.metal), which dithers it: as a
    /// SwiftUI gradient this faint, its 8-bit steps showed as rings. It holds
    /// still, so it renders once; the glow on the rim is what moves.
    private var ambient: some View {
        let reach = size * 4.2
        return Rectangle()
            .fill(.black)
            .frame(width: reach * 2, height: reach * 2)
            .colorEffect(ShaderLibrary.moxAmbient(
                .float2(reach, reach),
                .float(0.64 * size / 2),         // the hole: no light at all
                .float(size / 2),                // full light from the rim out
                .float(size * 2.6),              // how far it spreads
                .float(reach),                   // gone by the layer's edge
                .float(0.11),                    // peak strength
                .float3(0.0, 208.0 / 255, 132.0 / 255)
            ))
    }

    private func glow(_ t: Double, _ e: Double) -> some View {
        let r = size / 2
        // A hot spot that wanders the rim, never quite settling.
        let angle = t * 0.09 + 1.6 * noise(t, 0.4)

        return ZStack {
            // The corona, rising and falling with the charge.
            Circle()
                .stroke(Theme.green, lineWidth: size * 0.14)
                .frame(width: size * 1.04, height: size * 1.04)
                .blur(radius: size * 0.11)
                .opacity(0.1 + 0.3 * e)

            waves(t, e)

            Circle()
                .fill(Theme.mint)
                .frame(width: size * 0.34, height: size * 0.34)
                .blur(radius: size * 0.13)
                .opacity((0.08 + 0.1 * (0.5 + 0.5 * noise(t, 3.9))) * (0.5 + e))
                .offset(x: cos(angle) * r * 1.02, y: sin(angle) * r * 1.02)

            Circle()
                .fill(Theme.green)
                .frame(width: size * 0.42, height: size * 0.42)
                .blur(radius: size * 0.16)
                .opacity(0.1 * (0.5 + e))
                .offset(x: cos(angle + 2.6 + noise(t, 9.2)) * r, y: sin(angle + 2.6 + noise(t, 9.2)) * r)
        }
        .frame(width: imageWidth, height: imageWidth)
    }

    /// Light leaving the rim in waves. Two in flight at once, each born with
    /// its own strength, so some pulses are strong and some barely there.
    private func waves(_ t: Double, _ e: Double) -> some View {
        let period = 7.0
        return ZStack {
            ForEach(0..<2, id: \.self) { k in
                let cycle = t / period + Double(k) / 2
                let phase = cycle - floor(cycle)
                let born = floor(cycle) * 2 + Double(k)
                let strength = 0.35 + 0.65 * (0.5 + 0.5 * sin(born * 12.9898 + 4.1))
                Circle()
                    .stroke(Theme.mint, lineWidth: size * 0.05 * (1 - phase * 0.6))
                    .frame(width: size * (1.0 + phase * 0.9), height: size * (1.0 + phase * 0.9))
                    .blur(radius: size * (0.03 + 0.06 * phase))
                    .opacity(pow(1 - phase, 2) * 0.35 * strength * (0.4 + e))
            }
        }
    }

    /// Transparent over the hole, so no glow reaches the black centre, and
    /// fading out well before the edges so the glow never shows a boundary.
    private var outsideTheHole: some View {
        let hole = 0.64 * size / 2
        let edge = imageWidth / 2
        return RadialGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .clear, location: hole / edge),
                .init(color: .white, location: (hole + size * 0.1) / edge),
                .init(color: .white, location: (size * 0.62) / edge),
                .init(color: .clear, location: 1),
            ],
            center: .center,
            startRadius: 0,
            endRadius: imageWidth / 2
        )
    }

    /// Smooth noise in -1...1 from three slow, unrelated sines.
    private func noise(_ t: Double, _ seed: Double) -> Double {
        (sin(t * 0.37 + seed) + sin(t * 0.598 + seed * 2.1) + sin(t * 0.231 + seed * 0.7)) / 3
    }
}
