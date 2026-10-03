// Seed: snapshot every content item version (for admin diffs) and create a
// local admin user. Content itself is never stored here; it lives in /content.
import { PrismaClient } from "@prisma/client";
import { allItems, hashBody } from "../lib/admin/items";
import { validateAll } from "../lib/content/validate";

const prisma = new PrismaClient();

async function main() {
  const errors = validateAll().filter((i) => i.level === "error");
  if (errors.length) {
    errors.forEach((e) => console.error(`✖ ${e.where}: ${e.message}`));
    throw new Error("Content has errors; fix them before seeding (npm run content:validate).");
  }

  let created = 0;
  for (const item of allItems()) {
    const hash = hashBody(item.body, item.sources);
    const existing = await prisma.contentSnapshot.findUnique({ where: { itemId_version: { itemId: item.itemId, version: item.version } } });
    if (existing && existing.hash !== hash) {
      console.warn(`⚠ ${item.itemId} v${item.version} changed without a version bump; updating its snapshot. Bump "version" when content changes.`);
    }
    await prisma.contentSnapshot.upsert({
      where: { itemId_version: { itemId: item.itemId, version: item.version } },
      create: { itemId: item.itemId, version: item.version, kind: item.kind, trackId: item.trackId, hash, body: { ...(item.body as object), sources: item.sources } },
      update: { hash, body: { ...(item.body as object), sources: item.sources } },
    });
    if (!existing) created++;
  }
  console.log(`Content snapshots: ${created} new.`);

  for (const email of (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)) {
    await prisma.user.upsert({ where: { email }, update: { role: "ADMIN" }, create: { email, name: email.split("@")[0], role: "ADMIN" } });
    console.log(`Admin: ${email}`);
  }
}

main().finally(() => prisma.$disconnect());
