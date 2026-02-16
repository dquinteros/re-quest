import type { NextAuthOptions, Profile } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { env, getAllowedGitHubLogins, getOAuthEnv } from "@/lib/env";
import { upsertGitHubUserAndOAuthAccount } from "@/lib/oauth-account";

const oauthEnv = getOAuthEnv();

function getGitHubLogin(profile?: Profile): string | null {
  if (!profile) {
    return null;
  }

  const value = (profile as Record<string, unknown>).login;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLoginAllowed(login: string): boolean {
  const allowed = getAllowedGitHubLogins();
  return allowed.includes(login.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  secret: env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHubProvider({
      clientId: oauthEnv.clientId,
      clientSecret: oauthEnv.clientSecret,
      authorization: {
        params: {
          scope: "read:user repo project",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "github") {
        return false;
      }

      const login = getGitHubLogin(profile);
      if (!login) {
        return false;
      }

      return isLoginAllowed(login);
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && profile) {
        const persisted = await upsertGitHubUserAndOAuthAccount({
          account,
          profile,
        });

        token.userId = persisted.userId;
        token.login = persisted.login;
        token.sub = persisted.userId;
      }

      if (!token.userId && typeof token.sub === "string") {
        token.userId = token.sub;
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        return session;
      }

      if (typeof token.userId === "string") {
        session.user.id = token.userId;
      }

      if (typeof token.login === "string") {
        session.user.login = token.login;
      }

      return session;
    },
  },
};
