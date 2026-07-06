import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Route protection via the edge-safe config (no DB/providers needed to verify the
// JWT session). The `authorized` callback in auth.config decides public vs gated.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
