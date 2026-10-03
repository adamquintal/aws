# Exam Tracks

A calm, multi-user study platform built around "tracks". The first track is the **Prometheus Certified Associate (PCA)** exam. The goal is steady, honest confidence: short daily sessions, plain-English lessons, a mastery gate, spaced repetition, and a readiness score that doesn't flatter.

> Independent study material. Not affiliated with, endorsed by, or sponsored by the CNCF or the Linux Foundation.

## Stack

- Next.js 15 (App Router) + TypeScript, Tailwind
- Postgres via Prisma 6
- Auth.js v5: email magic link, GitHub and Google (each enabled only when configured), plus a dev-only password-less login
- Content: versioned MDX/JSON in `content/`, validated with Zod at load time and in CI
- Vitest for the learning engine and content validation

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL, AUTH_SECRET, ADMIN_EMAILS
npm install
npx prisma migrate dev          # create the schema
npm run db:seed                 # snapshot content versions + create admin users
npm run dev                     # http://localhost:3000
```

With `DEV_LOGIN="true"` (ignored in production) you can sign in with any email at `/signin`. Emails listed in `ADMIN_EMAILS` get the admin role.

| Script | What it does |
|---|---|
| `npm test` | Engine tests (mastery gate, Leitner scheduler, session builder, readiness, streak, projection, grading) and content validation tests |
| `npm run content:validate` | Fails on any content error. `--strict` also fails on topics with no content yet. |
| `npm run content:coverage` | Writes `content/tracks/<track>/CONTENT_COVERAGE.md` |
| `npm run content:apply-reviews` | Writes reviewer decisions from the DB back into content files (then commit) |
| `npm run db:seed` | Validates content, stores a snapshot of every item version (for admin diffs), upserts admins |

## Architecture

```
content/tracks/<track>/track.json          domains (weights), topics in learning order, settings
content/tracks/<track>/topics/<id>/lesson.mdx      frontmatter (analogy, key points, trap, explain-back, sources, status) + MDX body
content/tracks/<track>/topics/<id>/questions.json  questions with per-option notes, hint, sources, status, version
lib/content/      Zod schema, loader, validator
lib/engine/       pure TypeScript: mastery gate, scheduler interface + Leitner, session builder, readiness, streak, projection, grading
lib/services/     database-backed orchestration (record answer, build session, dashboard aggregates)
app/              routes (Today, Learn, Topics, Lesson, Explain-it-back, Progress, Settings, Admin)
prisma/           schema, migrations, seed
```

**Content lives in git; progress lives in Postgres.** The database stores `trackId / topicId / questionId` plus the question's `version` on every attempt. It never copies content, except immutable `ContentSnapshot`s used for version diffs in the admin screen.

**Adding a track needs no code changes.** Add `content/tracks/<new>/track.json` and topic folders. The onboarding screen lists every track it finds.

### Learning engine (`lib/engine`)

- **Mastery gate**: 10 correct in a row without hints (configurable per track), then explain-it-back with a self-comparison to a model answer. A miss resets the run quietly. Topics unlock strictly in order.
- **Spaced repetition**: the `Scheduler` interface stores opaque per-card state. `LeitnerScheduler` uses boxes at 1, 3, 7 and 21 days. A miss goes back to box 1, and a hinted correct answer stays in its box. Register an SM-2 scheduler to swap it without a migration.
- **Daily session**: about 10 questions. A warm-up of 2 from mastered topics, then up to 3 due reviews, then the current topic. Unseen questions come first, then missed ones, then the least recently seen. With nothing new to learn, the session is all review.
- **Readiness**: `Σ weight × recentAccuracy × (mastered topics / topics in domain)`, so unstarted topics count as zero. **Ready to book** needs every domain ≥ 80% on its last 30 answers (minimum 20), every topic mastered, and a passed mock exam. Mock exams arrive in Phase 2, so nobody can be "ready" yet, by design.
- **Streak**: forgiving. One missed day never breaks it, two in a row do. Day boundaries follow the learner's timezone.
- **Projection**: topics mastered per day over the last 28 days, plus a 7-day review buffer, compared with the exam date.

### Content rules (enforced by `content:validate`, run in CI)

- Every lesson and question has ≥1 source on an allowed host (per track: `prometheus.io`, `github.com/prometheus`, `github.com/cncf`, `opentelemetry.io`).
- Every question has a correct answer, single-choice questions have exactly one, and every option has a note.
- No positional options ("all of the above"), because options are shuffled when displayed.
- Every question declares the terms it `uses`. Each must be `introduced` by its own lesson or an earlier one in learning order.
- `human-verified` requires a named reviewer. Only reviewers set it, through the admin screen and then `content:apply-reviews`.

### Review workflow

1. Content is written from a fetched doc page and marked `source-checked`.
2. A reviewer opens **Admin → Review queue**, checks the item against its sources (with a diff against the previous version), and records `human-verified` (or sends it back to `draft` with a note).
3. `npm run content:apply-reviews` writes decisions into the files. Commit them. When content changes, bump `version`, so earlier reviews no longer apply.

Learners can **Report a problem** on any question. Reports and the most-missed questions show in **Admin → Question quality**.

## Privacy

- **Settings → Export my data** downloads everything stored about the user as JSON.
- **Settings → Delete account** removes the user and all their study data (cascade).

## Sources and verification notes (PCA)

- Curriculum: [CNCF PCA_Curriculum.pdf](https://github.com/cncf/curriculum/blob/master/PCA_Curriculum.pdf) (single commit `8fbb7f2`, 2022-08-31).
- Lessons were written in our own words from the official docs. In this build environment prometheus.io itself was blocked, so each page was read from the Markdown source it's built from (`prometheus/docs@605cf81`, `prometheus/prometheus@5ba0e86`, `prometheus/alertmanager@61ba43d`). Every source records `readFrom`. Section anchors were derived from headings and should be click-tested once.
- Exam logistics (60 questions, 90 minutes, pass mark) are **unverified** and marked as such in `track.json`. Confirm them on the Linux Foundation exam page.
- The research notes are in `/research/pca-sources.md` at the repo root.

## Deploy for free (Vercel Hobby + Neon)

1. **Neon**: add it from the project's **Storage** tab in Vercel (free plan). It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (used for migrations).
2. **GitHub OAuth app** (GitHub → Settings → Developer settings → OAuth Apps): set the callback URL to `https://<your-app>.vercel.app/api/auth/callback/github`.
3. **Vercel** (vercel.com, Hobby plan): Import the `aws` repo, set **Root Directory** to `apps/exam-tracks`, and pick the deploy branch. Add these environment variables:
   - `AUTH_SECRET`: output of `npx auth secret`
   - `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: from the OAuth app
   - `ADMIN_EMAILS`: your GitHub account's primary email
4. Deploy. The `vercel-build` script runs migrations, snapshots content and builds the app. Every push to the branch redeploys.
