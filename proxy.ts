import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Route protection (Next 16 `proxy` convention — the former `middleware.ts`; the file was renamed,
// the behaviour is identical). Uses the DB-free auth config so verifying the JWT session needs no
// providers or Prisma. The `authorized` callback in auth.config decides public vs gated and keeps
// every redirect on the visitor's own subdomain.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
