// Create (or reset) the first global-admin local account. Run once on the host after
// the DB is up:  node scripts/create-admin.mjs <email> <password> [name]
// Requires DATABASE_URL. Off Azure there is no SSO bootstrap, so this seeds the first admin.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , email, password, ...nameParts] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/create-admin.mjs <email> <password> [name]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
const u = await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), name: nameParts.join(" ") || null, passwordHash, role: "global-admin", provider: "credentials" },
  update: { passwordHash, role: "global-admin" },
});
console.log(`✓ Admin ready: ${u.email} (global-admin)`);
await prisma.$disconnect();
