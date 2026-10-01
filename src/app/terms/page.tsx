export const metadata = { title: "Terms · mox" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 py-6 text-[15px] leading-relaxed text-ink-dim">
      <header>
        <h1 className="text-2xl font-bold text-ink">Terms of use</h1>
        <p className="mt-1 text-sm text-ink-faint">Last updated 1 October 2026</p>
      </header>
      <p>MOX is a free personal guide to film and TV. By using it you agree to these terms.</p>
      <ul className="list-disc space-y-1.5 ps-5">
        <li>MOX tells you where titles are available; it does not stream anything. Watching happens on the services you subscribe to, under their own terms.</li>
        <li>Availability, air times and prices come from third parties and can be wrong or out of date. Check the service before you rely on them.</li>
        <li>Keep your password to yourself, and do not use MOX to try to reach other people&apos;s accounts or to overload the service.</li>
        <li>MOX is provided as it is, without guarantees, and may change or stop at any time.</li>
        <li>How your information is handled is described in the <a className="text-love underline" href="/privacy">privacy policy</a>.</li>
        <li>Questions: <a className="text-love underline" href="mailto:mohammedosama@gmail.com">mohammedosama@gmail.com</a>.</li>
      </ul>
    </article>
  );
}
