// Sign-in with Google or GitHub (Auth.js v5). Sessions are signed JWT cookies,
// so there's no database. Reads AUTH_SECRET, AUTH_GOOGLE_ID/_SECRET and
// AUTH_GITHUB_ID/_SECRET from the environment.

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // Used by middleware.ts: signed-out visitors to a protected page are sent
    // to /login?callbackUrl=<that page>.
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    // A stable id per account, e.g. "github:12345". Usage limits are keyed on it.
    jwt({ token, account }) {
      if (account) token.uid = `${account.provider}:${account.providerAccountId}`;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
