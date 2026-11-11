import SwiftUI

/// What stands in while something loads.
///
/// A turning wheel says "wait" and nothing else. A skeleton says what is
/// coming — posters, rows, a title page — and holds its place, so the screen
/// does not jump when the answer lands. Where the shape is not known ahead (the
/// next page of a list, a search under way) the MOX mark pulses instead.

/// The MOX mark, breathing. For the end of a list and other small waits.
struct MoxPulse: View {
    var size: CGFloat = 34
    @State private var full = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Image("TabRing")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .scaleEffect(reduceMotion ? 1 : (full ? 1.1 : 0.88))
            .opacity(reduceMotion ? 0.8 : (full ? 1 : 0.5))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) { full = true }
            }
            .accessibilityLabel("Loading")
    }
}

/// The outline of a screen that has not arrived yet.
struct Skeleton: View {
    enum Kind {
        /// A grid of posters: My List, Picks, a studio's work.
        case posters
        /// A big picture, then shelves: Home.
        case shelves
        /// A list of pictures with two lines beside each: News, Today, Friends, F1.
        case rows
        /// Logo tiles: Studios.
        case tiles
        /// A title's or a person's page.
        case sheet
    }

    let kind: Kind
    @Environment(\.horizontalSizeClass) private var size
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lit = false

    private var wide: Bool { size == .regular }
    private var margin: CGFloat { wide ? 40 : 20 }

    var body: some View {
        Group {
            switch kind {
            case .posters: posters
            case .shelves: shelves
            case .rows: rows
            case .tiles: tiles
            case .sheet: sheet
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(reduceMotion ? 0.8 : (lit ? 1 : 0.45))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { lit = true }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
    }

    private func bone(_ width: CGFloat? = nil, _ height: CGFloat, radius: CGFloat = 6) -> some View {
        RoundedRectangle(cornerRadius: radius).fill(Theme.surface).frame(width: width, height: height)
    }

    private var poster: some View {
        RoundedRectangle(cornerRadius: 12).fill(Theme.surface).aspectRatio(2 / 3, contentMode: .fit)
    }

    private var posters: some View {
        VStack(alignment: .leading, spacing: 14) {
            bone(120, 16)
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: wide ? 150 : 104), spacing: 12, alignment: .top)],
                spacing: 18
            ) {
                ForEach(0..<(wide ? 18 : 9), id: \.self) { _ in poster }
            }
        }
        .padding(.horizontal, margin)
    }

    private var shelves: some View {
        VStack(alignment: .leading, spacing: 28) {
            RoundedRectangle(cornerRadius: 22).fill(Theme.surface)
                .frame(height: wide ? 420 : 240)
                .padding(.horizontal, margin)
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 12) {
                    bone(150, 16).padding(.leading, margin)
                    HStack(spacing: 12) {
                        ForEach(0..<(wide ? 8 : 4), id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 12).fill(Theme.surface)
                                .frame(width: wide ? 150 : 118, height: wide ? 225 : 177)
                        }
                    }
                    .padding(.leading, margin)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .clipped()
                }
            }
        }
    }

    private var rows: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(0..<(wide ? 9 : 6), id: \.self) { i in
                HStack(spacing: 14) {
                    bone(wide ? 150 : 108, wide ? 84 : 64, radius: 12)
                    VStack(alignment: .leading, spacing: 9) {
                        bone(i.isMultiple(of: 2) ? 190 : 150, 14)
                        bone(i.isMultiple(of: 3) ? 90 : 120, 11)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.horizontal, margin)
    }

    private var tiles: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: wide ? 200 : 150), spacing: 12)], spacing: 12) {
            ForEach(0..<(wide ? 12 : 8), id: \.self) { _ in
                RoundedRectangle(cornerRadius: 16).fill(Theme.surface).frame(height: wide ? 112 : 90)
            }
        }
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 22) {
            Rectangle().fill(Theme.surface)
                .frame(height: wide ? 420 : 300)
                .overlay { MoxPulse(size: 44) }
            VStack(alignment: .leading, spacing: 12) {
                bone(230, 26, radius: 8)
                bone(170, 12)
            }
            .padding(.horizontal, margin)
            bone(nil, 54, radius: 16).frame(maxWidth: wide ? 560 : .infinity).padding(.horizontal, margin)
            HStack(spacing: 10) {
                bone(124, 44, radius: 22)
                bone(150, 44, radius: 22)
                bone(44, 44, radius: 22)
            }
            .padding(.horizontal, margin)
            VStack(alignment: .leading, spacing: 10) {
                bone(nil, 13).frame(maxWidth: .infinity)
                bone(nil, 13).frame(maxWidth: .infinity)
                bone(210, 13)
            }
            .padding(.horizontal, margin)
        }
    }
}
