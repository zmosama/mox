import SwiftUI

/// Formula 1 on the television: the next race and when its sessions are in
/// Cairo, the season round by round, and both championships.
///
/// The spoiler shield is the server's: with it on, results and standings are
/// simply not sent, and nothing here goes looking for them.
struct TVF1: View {
    @Environment(API.self) private var api
    @State private var board: F1Board?
    @State private var problem: String?
    @State private var notice: String?

    var body: some View {
        ZStack {
            TV.ink.ignoresSafeArea()
            if let board {
                ScrollView {
                    VStack(alignment: .leading, spacing: 50) {
                        if let next = board.next { nextRace(next, board) }
                        HStack(alignment: .top, spacing: 60) {
                            if let standings = board.standings {
                                table("Drivers", standings.drivers.prefix(10).map { ($0.position, $0.name, $0.team ?? "", $0.color, $0.points) })
                                table("Constructors", standings.teams.prefix(10).map { ($0.position, $0.name, "", $0.color, $0.points) })
                            } else if board.shield {
                                Text("Standings are hidden while the spoiler shield is on.")
                                    .font(.system(size: 26)).foregroundStyle(TV.muted)
                            }
                        }
                        .padding(.horizontal, TV.edge)
                        season(board)
                    }
                    .padding(.vertical, 40)
                }
                .scrollClipDisabled()
                .ignoresSafeArea(edges: .horizontal)
            } else if let problem {
                Text(problem).font(.system(size: 28)).foregroundStyle(.orange)
            } else {
                ProgressView()
            }
        }
        .task(id: api.revision) {
            if board == nil { board = api.peek("/api/f1") }
            do { board = try await api.f1() } catch { if board == nil { problem = "Can't load Formula 1: \(error.localizedDescription)" } }
        }
        .alert("MOX", isPresented: .init(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK") {}
        } message: {
            Text(notice ?? "")
        }
    }

    private func nextRace(_ race: F1Race, _ board: F1Board) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("NEXT · ROUND \(race.round)")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(TV.green)
            Text(race.name)
                .font(.system(size: 66, weight: .bold))
                .foregroundStyle(TV.paper)
            Text("\(race.circuit)  ·  \(race.locality), \(race.country)")
                .font(.system(size: 28))
                .foregroundStyle(TV.muted)
            HStack(spacing: 20) {
                ForEach(race.sessions, id: \.self) { session in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(session.label)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(session.isMain ? TV.paper : TV.muted)
                        if let date = session.date {
                            Text(F1Time.dayTime(date))
                                .font(.system(size: 26, design: .monospaced))
                                .foregroundStyle(session.isMain ? TV.green : TV.muted)
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 16)
                    .background(.white.opacity(0.06), in: .rect(cornerRadius: 14))
                }
            }
            .padding(.top, 8)
            Text("Times are Cairo's.")
                .font(.system(size: 21)).foregroundStyle(TV.muted)
            Button {
                Task {
                    let link = TVLink.target(for: Platform(name: board.watch.name, logo: nil, url: board.watch.url))
                    if !(await link.open()) {
                        notice = "\(board.watch.name) can't be opened from here. Open it from the Home Screen."
                    }
                }
            } label: {
                Label("Watch on \(board.watch.name)", systemImage: "play.fill")
                    .font(.system(size: 28, weight: .semibold))
                    .padding(.horizontal, 10)
            }
            .padding(.top, 10)
        }
        .padding(.horizontal, TV.edge)
        .focusSection()
    }

    private func table(_ title: String, _ rows: [(Int, String, String, String, Double)]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(TV.paper)
            ForEach(rows, id: \.1) { row in
                HStack(spacing: 16) {
                    Text("\(row.0)")
                        .font(.system(size: 25, weight: .bold, design: .monospaced))
                        .foregroundStyle(TV.muted)
                        .frame(width: 44, alignment: .trailing)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(tvHex: row.3))
                        .frame(width: 6, height: 34)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(row.1).font(.system(size: 26, weight: .medium)).foregroundStyle(TV.paper).lineLimit(1)
                        if !row.2.isEmpty {
                            Text(row.2).font(.system(size: 20)).foregroundStyle(TV.muted).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 12)
                    Text(row.4 == row.4.rounded() ? String(Int(row.4)) : String(format: "%.1f", row.4))
                        .font(.system(size: 26, weight: .semibold, design: .monospaced))
                        .foregroundStyle(TV.paper)
                }
            }
        }
        .frame(maxWidth: 760, alignment: .leading)
    }

    private func season(_ board: F1Board) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\(String(board.season)) season")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(TV.paper)
                .padding(.horizontal, TV.edge)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 28) {
                    ForEach(board.races) { race in
                        Button {} label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("ROUND \(race.round)")
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundStyle(race.round == board.next?.round ? TV.green : TV.muted)
                                Text(race.name.replacingOccurrences(of: " Grand Prix", with: ""))
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundStyle(TV.paper)
                                    .lineLimit(1)
                                Text(F1Time.parse(race.at).map(F1Time.dayMonth) ?? "")
                                    .font(.system(size: 23))
                                    .foregroundStyle(TV.muted)
                                if let podium = race.podium, !podium.isEmpty {
                                    Text(podium.prefix(3).map { $0.code ?? $0.driver }.joined(separator: " · "))
                                        .font(.system(size: 21, design: .monospaced))
                                        .foregroundStyle(TV.paper.opacity(0.8))
                                } else {
                                    Text(race.sprint ? "Sprint weekend" : " ")
                                        .font(.system(size: 21))
                                        .foregroundStyle(TV.muted)
                                }
                            }
                            .frame(width: 300, alignment: .leading)
                            .padding(22)
                        }
                        .buttonStyle(.card)
                    }
                }
                .padding(.horizontal, TV.edge)
                .padding(.vertical, 26)
            }
            .scrollClipDisabled()
        }
        .focusSection()
    }
}

extension Color {
    /// "#27F4D2" → the colour; anything unreadable is a neutral grey.
    init(tvHex s: String) {
        let v = UInt32(s.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x8A8F98
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}
