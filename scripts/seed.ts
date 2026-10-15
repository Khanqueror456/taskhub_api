import { prisma } from '../src/lib/prisma.js';

const ORGS = 20;
const PROJECTS_PER_ORG = 5;
const TASKS_PER_ORG = 5000;
const CHUNK = 1000;

const verbs = ['Fix', 'Write', 'Deploy', 'Review', 'Plan', 'Refactor', 'Test', 'Design', 'Document'];
const nouns = ['login', 'docs', 'service', 'pipeline', 'dashboard', 'billing', 'search', 'email', 'cache'];
const statuses = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const DAY = 86_400_000;

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'seed@example.com' },
    update: {},
    create: { email: 'seed@example.com', name: 'Seed User', passwordHash: 'not-a-real-hash' },
  });

  let firstOrgId = '';
  for (let o = 0; o < ORGS; o++) {
    const org = await prisma.organization.create({
      data: {
        name: `Seed Org ${o + 1}`,
        slug: `seed-${Date.now()}-${o}`,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    if (o === 0) firstOrgId = org.id;

    const projects = await Promise.all(
      Array.from({ length: PROJECTS_PER_ORG }, (_, p) =>
        prisma.project.create({ data: { organizationId: org.id, name: `Project ${p + 1}` } }),
      ),
    );

    for (let done = 0; done < TASKS_PER_ORG; done += CHUNK) {
      await prisma.task.createMany({
        data: Array.from({ length: CHUNK }, () => ({
          organizationId: org.id,
          projectId: pick(projects).id,
          title: `${pick(verbs)} ${pick(nouns)} ${pick(nouns)}`,
          description: `${pick(verbs)} the ${pick(nouns)} before the next release`,
          status: pick(statuses),
          priority: pick(priorities),
          assigneeId: Math.random() < 0.7 ? user.id : null,
          dueDate: Math.random() < 0.6 ? new Date(Date.now() + (Math.random() - 0.3) * 90 * DAY) : null,
          createdAt: new Date(Date.now() - Math.random() * 365 * DAY),
        })),
      });
    }
    console.log(`Seeded org ${o + 1}/${ORGS}`);
  }
  console.log(`\nFirst org id (use it in EXPLAIN): ${firstOrgId}`);
}

main().finally(() => prisma.$disconnect());