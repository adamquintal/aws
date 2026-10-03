import NextAuth, { type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import Credentials from "next-auth/providers/credentials";
import crypto from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Passcode login: email + a shared secret passcode set in ACCESS_PASSCODE (min 12 chars).
// A simple option for personal deployments without an OAuth app or email provider.
const accessPasscode = process.env.ACCESS_PASSCODE ?? "";
export const passcodeLoginEnabled = accessPasscode.length >= 12;

function passcodeMatches(input: string): boolean {
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(accessPasscode).digest();
  return crypto.timingSafeEqual(a, b);
}

async function upsertUser(email: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0], role: adminEmails.includes(email) ? "ADMIN" : "LEARNER" },
  });
}

export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";

// Providers are enabled only when configured, so the app runs locally with none.
const providers: Provider[] = [];
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.EMAIL_SERVER) providers.push(Nodemailer({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM }));
if (devLoginEnabled)
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return null;
        return upsertUser(email);
      },
    }),
  );
if (passcodeLoginEnabled)
  providers.push(
    Credentials({
      id: "passcode",
      name: "Passcode",
      credentials: { email: { label: "Email", type: "email" }, passcode: { label: "Passcode", type: "password" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const passcode = String(creds?.passcode ?? "");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !passcodeMatches(passcode)) {
          await new Promise((r) => setTimeout(r, 800)); // slow down guessing
          return null;
        }
        return upsertUser(email);
      },
    }),
  );

export const enabledProviders = providers.map((p) => {
  const cfg = typeof p === "function" ? p() : p;
  return { id: cfg.id, name: cfg.name, type: cfg.type };
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  // JWT sessions so the Credentials providers work alongside OAuth/email.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/signin", verifyRequest: "/signin?check=email" },
  events: {
    async createUser({ user }) {
      if (user.email && adminEmails.includes(user.email.toLowerCase()))
        await prisma.user.update({ where: { id: user.id! }, data: { role: "ADMIN" } });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (token.sub) {
        const db = await prisma.user.findUnique({ where: { id: token.sub }, select: { role: true } });
        if (!db) return null; // account deleted
        token.role = db.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = (token.role as Role) ?? "LEARNER";
      return session;
    },
  },
});
