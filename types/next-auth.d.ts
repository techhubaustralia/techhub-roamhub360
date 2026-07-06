import type { DefaultSession } from "next-auth";

// Augment the session + JWT with RoamHub360's app fields (role/sites/multiBook),
// set in the jwt/session callbacks in auth.ts.
declare module "next-auth" {
  interface Session {
    user: {
      role?: string;
      sites?: string[];
      multiBook?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    sites?: string[];
    multiBook?: boolean;
    uid?: string;
  }
}
