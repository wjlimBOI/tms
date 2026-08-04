// lib/auth.ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { loginSchema } from "./validation";
import { logAuthEvent } from "./audit"; // ✅ added

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      name: string;
      email?: string | null;
      role_id: number;
      role_name: string;
      roleIds: number[];
      must_change_password: boolean;
    };
  }
  interface JWT {
    id: string;
    role_id: number;
    role_name: string;
    roleIds: number[];
    must_change_password: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      // The `req` parameter is available in NextAuth v4+
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          // Log missing credentials (optional)
          await logAuthEvent("LOGIN_FAILED", 0, req, {
            username: credentials?.username || "unknown",
            reason: "Missing credentials",
            source: "auth"
          });
          return null;
        }

        // 1. Trim username and validate with Zod
        const username = credentials.username.trim();
        const password = credentials.password;
        const validation = loginSchema.safeParse({ username, password });
        if (!validation.success) {
          await logAuthEvent("LOGIN_FAILED", 0, req, {
            username,
            reason: "Validation failed",
            source: "auth"
          });
          return null;
        }

        // 2. Find user
        const user = await prisma.users.findUnique({
          where: { username },
        });
        if (!user) {
          await logAuthEvent("LOGIN_FAILED", 0, req, {
            username,
            reason: "User not found",
            source: "auth"
          });
          return null;
        }

        // 3. Check account status
        if (!user.is_active) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Account inactive",
            source: "auth"
          });
          return null;
        }
        if (user.is_deleted) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Account deleted",
            source: "auth"
          });
          return null;
        }

        // 4. Check access dates
        const now = new Date();
        if (user.access_start_date && new Date(user.access_start_date) > now) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Access not yet started",
            source: "auth"
          });
          return null;
        }
        if (user.access_end_date && new Date(user.access_end_date) < now) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Access expired",
            source: "auth"
          });
          return null;
        }

        // 5. Account lockout check
        if (user.locked_until && new Date(user.locked_until) > now) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Account locked",
            source: "auth"
          });
          return null; // account locked
        }
        // If lock expired, reset attempts
        if (user.locked_until && new Date(user.locked_until) <= now) {
          await prisma.users.update({
            where: { user_id: user.user_id },
            data: {
              failed_login_attempts: 0,
              locked_until: null,
              last_failed_attempt: null,
            },
          });
        }

        // 6. Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
          // Increment failed attempts
          const newAttempts = (user.failed_login_attempts || 0) + 1;
          let lockedUntil = null;
          if (newAttempts >= 5) {
            lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          }
          await prisma.users.update({
            where: { user_id: user.user_id },
            data: {
              failed_login_attempts: newAttempts,
              last_failed_attempt: now,
              locked_until: lockedUntil,
            },
          });
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "Invalid password",
            source: "auth"
          });
          return null;
        }

        // 7. Successful login – reset attempts and update last_login
        await prisma.users.update({
          where: { user_id: user.user_id },
          data: {
            failed_login_attempts: 0,
            locked_until: null,
            last_failed_attempt: null,
            last_login: now,
          },
        });

        // 8. Fetch user roles
        const userRoles = await prisma.user_roles.findMany({
          where: { user_id: user.user_id },
          include: { roles: true },
          orderBy: { role_id: "asc" },
        });
        if (userRoles.length === 0) {
          await logAuthEvent("LOGIN_FAILED", user.user_id, req, {
            username,
            reason: "No roles assigned",
            source: "auth"
          });
          return null;
        }

        const roles = userRoles.map((ur) => ur.roles);
        const primaryRole = roles[0];
        const roleIds = roles.map((r) => r.role_id);

        // 9. Log successful login
        await logAuthEvent("LOGIN", user.user_id, req, {
          username,
          login_method: "password",
          source: "auth"
        });

        // 10. Return user object
        const displayName = (user as any).display_name || user.username;
        return {
          id: String(user.user_id),
          name: displayName,
          email: user.email,
          role_id: primaryRole.role_id,
          role_name: primaryRole.role_name,
          roleIds: roleIds,
          must_change_password: user.must_change_password ?? false,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role_id = (user as any).role_id;
        token.role_name = (user as any).role_name;
        token.roleIds = (user as any).roleIds;
        token.must_change_password = (user as any).must_change_password;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? parseInt(token.id, 10) : Number(token.id);
        session.user.email = token.email as string | undefined;
        session.user.name = token.name as string;
        session.user.role_id = token.role_id as number;
        session.user.role_name = token.role_name as string;
        session.user.roleIds = token.roleIds as number[];
        session.user.must_change_password = token.must_change_password as boolean;
      }
      return session;
    },
  },
  events: {
    // ✅ Log logout events
    async signOut({ session, token }) {
      const userId = token?.id ? parseInt(token.id as string, 10) : 0;
      if (userId) {
        await logAuthEvent("LOGOUT", userId, null, {
          source: "auth"
        });
      }
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};