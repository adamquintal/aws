// Writes reviewer decisions from the database back into the content files so
// the repo stays the source of truth. Commit the result.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { PrismaClient } from "@prisma/client";
import { CONTENT_ROOT } from "../lib/content/load";
import { FILE_STATUS } from "../lib/admin/items";

const prisma = new PrismaClient();

async function main() {
  const decisions = await prisma.reviewDecision.findMany({ where: { appliedAt: null }, orderBy: { createdAt: "asc" }, include: { reviewer: true } });
  // Latest decision per item+version wins.
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) latest.set(`${d.itemId}@${d.version}`, d);

  let applied = 0, skipped = 0;
  for (const d of latest.values()) {
    const [trackId, topicId, qid] = d.itemId.split("/");
    const status = FILE_STATUS[d.status];
    const reviewer = status === "human-verified" ? d.reviewer.name ?? d.reviewer.email : null;
    const dir = path.join(CONTENT_ROOT, trackId, "topics", topicId);
    let ok = false;
    if (qid === "lesson") {
      const file = path.join(dir, "lesson.mdx");
      const parsed = matter(fs.readFileSync(file, "utf8"));
      if (parsed.data.version === d.version) {
        parsed.data.status = status;
        parsed.data.reviewer = reviewer;
        fs.writeFileSync(file, matter.stringify(parsed.content, parsed.data));
        ok = true;
      }
    } else {
      const file = path.join(dir, "questions.json");
      const qs = JSON.parse(fs.readFileSync(file, "utf8")) as { id: string; version: number; status: string; reviewer: string | null }[];
      const q = qs.find((x) => x.id === qid);
      if (q && q.version === d.version) {
        q.status = status;
        q.reviewer = reviewer;
        fs.writeFileSync(file, JSON.stringify(qs, null, 2) + "\n");
        ok = true;
      }
    }
    if (ok) {
      applied++;
      await prisma.reviewDecision.updateMany({ where: { itemId: d.itemId, version: d.version, appliedAt: null }, data: { appliedAt: new Date() } });
    } else {
      skipped++;
      console.warn(`skip ${d.itemId} v${d.version}: item missing or version changed since review`);
    }
  }
  console.log(`Applied ${applied} review decision(s), skipped ${skipped}. Run content:validate, then commit.`);
}

main().finally(() => prisma.$disconnect());
