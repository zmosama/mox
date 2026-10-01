export const metadata = { title: "Privacy · mox" };

/**
 * What MOX keeps and why. Every line here is checked against the code: when a
 * table or a third party is added, this page changes in the same commit.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6 text-[15px] leading-relaxed text-ink-dim">
      <header>
        <h1 className="text-2xl font-bold text-ink">Privacy</h1>
        <p className="mt-1 text-sm text-ink-faint">Last updated 1 October 2026</p>
      </header>

      <p>
        MOX is a personal film and TV guide. It keeps only what it needs to remember you, and it does
        not sell, rent or share your information with anybody. There are no ads, no analytics and no
        trackers.
      </p>

      <Section title="What we keep">
        <li>Your account: a username, a display name, an email address, and a password stored only as a salted scrypt hash.</li>
        <li>If you sign in with Google: the name, email address and profile picture Google shares, and Google&apos;s identifier for your account, so the same Google account always reaches the same MOX account.</li>
        <li>What you tell MOX: your ratings, the shows and people you follow, your watchlist, the episodes you have watched, the services you subscribe to, your preferences and, if you add one, your profile photo.</li>
        <li>If you turn on notifications: the address your browser or phone gives us for sending them.</li>
        <li>A sign-in session, kept in a single cookie that exists only to keep you signed in.</li>
      </Section>

      <Section title="What we use it for">
        <li>To show you what is on, what is new on your services, and what you might like — the recommendations come from your own ratings, computed on our server.</li>
        <li>To send the notifications you turned on, and nothing else.</li>
      </Section>

      <Section title="Who else is involved">
        <li>Our server is hosted by DigitalOcean, and the database is backed up daily to a private Google Drive.</li>
        <li>Film and TV information comes from TMDB, TVmaze and JustWatch. We ask them about titles; we never send them anything about you.</li>
        <li>Google, only if you choose to sign in with it.</li>
        <li>If you add an AI key in the iPhone app, it stays in your iPhone&apos;s keychain and is never sent to our server.</li>
      </Section>

      <Section title="Your choices">
        <li>You can change your email and password, and delete your account, from your account settings. Deleting it removes your ratings, follows, watchlist and everything else tied to it.</li>
        <li>Anything else: write to <a className="text-love underline" href="mailto:mohammedosama@gmail.com">mohammedosama@gmail.com</a>.</li>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-ink">{title}</h2>
      <ul className="list-disc space-y-1.5 ps-5">{children}</ul>
    </section>
  );
}
