// Sign-in with Google or GitHub (Auth.js v5). Sessions are signed JWT cookies.
// Reads AUTH_SECRET, AUTH_GOOGLE_ID/_SECRET and AUTH_GITHUB_ID/_SECRET from
// the environment. The account id below keys usage limits and cloud sync.

import NextAuth, { type Account, type Profile } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

// Bumped whenever the id scheme changes. Sessions from an older scheme are
// treated as signed out, so one person never ends up with two ids at once
// (e.g. an old provider id on one device and the new email id on another).
const ID_VERSION = 2;

/**
 * The email this provider vouches for, or null.
 *
 * Why only verified emails: the id is shared by every sign-in method, so
 * anyone who signs in with an email gets that account's runs and synced
 * history. If we trusted an unverified address, someone could add your email
 * to a new account and walk straight into your data. Google says so with
 * `email_verified`; for GitHub we ask its emails API for the primary address
 * and use it only if GitHub marks it verified.
 */
async function verifiedEmail(account: Account, profile: Profile | undefined): Promise<string | null> {
  if (account.provider === "google") {
    return profile?.email_verified === true && typeof profile.email === "string" ? profile.email : null;
  }
  if (account.provider === "github" && account.access_token) {
    try {
      const res = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${account.access_token}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      const emails: { email?: unknown; primary?: unknown; verified?: unknown }[] = await res.json();
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary === true && e.verified === true) : undefined;
      return typeof primary?.email === "string" ? primary.email : null;
    } catch {
      return null; // can't confirm it: fall back to the provider id
    }
  }
  return null;
}

/** "email:ada@example.com" when verified, otherwise "github:12345" / "google:6789". */
async function accountId(account: Account, profile: Profile | undefined) {
  const email = await verifiedEmail(account, profile);
  return email ? `email:${email.trim().toLowerCase()}` : `${account.provider}:${account.providerAccountId}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // Used by middleware.ts: signed-out visitors to a protected page are sent
    // to /login?callbackUrl=<that page>.
    authorized({ auth }) {
      return Boolean(auth?.user?.id);
    },
    // `account` and `profile` are only present at sign-in, so the id is
    // worked out once and kept in the token.
    async jwt({ token, account, profile }) {
      if (account) {
        token.uid = await accountId(account, profile);
        token.uidv = ID_VERSION;
      }
      // A session from an older id scheme: sign it out (null ends the session),
      // so the next sign-in gets the current id.
      if (token.uidv !== ID_VERSION) return null;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string" && token.uidv === ID_VERSION) session.user.id = token.uid;
      return session;
    },
  },
});
