import AVFoundation
import Observation
import Speech

/// The mic in the Ask MOX bar: speech to text, on the device's language.
@Observable
final class Dictation {
    private(set) var listening = false
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    /// Starts listening, or stops if already listening. `onText` gets the
    /// transcript so far each time it improves.
    func toggle(_ onText: @escaping @MainActor (String) -> Void) async {
        if listening { stop(); return }
        guard await Self.authorize() else { return }
        start(onText)
    }

    func stop() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        engine = nil
        request = nil
        task = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func start(_ onText: @escaping @MainActor (String) -> Void) {
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { return }

        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        Self.feed(engine.inputNode, into: request)
        engine.prepare()
        do { try engine.start() } catch { return }

        self.engine = engine
        self.request = request
        listening = true
        task = recognizer.recognitionTask(with: request, resultHandler: Self.handler { [weak self] text, done in
            if let text, !text.isEmpty { onText(text) }
            if done { self?.stop() }
        })
    }

    // The audio tap and the recogniser call back on their own threads, so
    // their closures are built outside the main actor.

    nonisolated private static func feed(_ node: AVAudioInputNode, into request: SFSpeechAudioBufferRecognitionRequest) {
        nonisolated(unsafe) let request = request
        node.installTap(onBus: 0, bufferSize: 1024, format: node.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }
    }

    nonisolated private static func handler(
        _ deliver: @escaping @MainActor (String?, Bool) -> Void
    ) -> @Sendable (SFSpeechRecognitionResult?, (any Error)?) -> Void {
        { result, error in
            let text = result?.bestTranscription.formattedString
            let done = error != nil || (result?.isFinal ?? false)
            Task { @MainActor in deliver(text, done) }
        }
    }

    nonisolated private static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { done in
            SFSpeechRecognizer.requestAuthorization { done.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
