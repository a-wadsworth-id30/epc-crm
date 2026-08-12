import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnvFile } from "node:process";
import { normalizedContactPhone } from "../src/lib/phone-normalization";

loadEnvFile(".env");

const prisma = new PrismaClient();

const defaultAdminEmail = "e2e.admin@example.com";
const defaultAdminPassword = "ChangeMe123!";
const defaultUserEmail = "e2e.user@example.com";
const defaultUserPassword = "ChangeMe123!";

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  return value;
}

function isDisposableDatabase(value: string) {
  if (process.env.CRM_E2E_ALLOW_DATABASE_URL === "true") {
    return true;
  }

  try {
    const url = new URL(value);
    const databaseName = url.pathname.replace(/^\//, "").toLowerCase();

    return databaseName.includes("e2e") || databaseName.includes("test");
  } catch {
    return false;
  }
}

function requireDisposableDatabase() {
  const value = databaseUrl();

  if (!isDisposableDatabase(value)) {
    throw new Error(
      "Refusing to prepare CRM E2E data against a non-test database. " +
        "Use a database name containing test/e2e or set CRM_E2E_ALLOW_DATABASE_URL=true only for a disposable database.",
    );
  }
}

async function upsertUser({
  email,
  name,
  password,
  role,
}: {
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "USER";
}) {
  const [firstName, ...rest] = name.split(" ");
  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.user.upsert({
    where: { email },
    update: {
      firstName,
      lastName: rest.join(" ") || null,
      name,
      passwordHash,
      role,
      status: "ACTIVE",
      voiceRoutingMode: "BROWSER",
    },
    create: {
      email,
      firstName,
      lastName: rest.join(" ") || null,
      name,
      passwordHash,
      role,
      status: "ACTIVE",
      voiceRoutingMode: "BROWSER",
    },
  });
}

async function ensurePipelineStage() {
  return prisma.salesPipelineStage.upsert({
    where: { slug: "e2e-lead" },
    update: {
      bucket: "LEAD",
      color: "#2563EB",
      defaultProbability: 10,
      description: "Disposable E2E lead stage.",
      isActive: true,
      isClosed: false,
      isLost: false,
      isWon: false,
      name: "E2E Lead",
      sortOrder: 5,
    },
    create: {
      bucket: "LEAD",
      color: "#2563EB",
      defaultProbability: 10,
      description: "Disposable E2E lead stage.",
      isActive: true,
      isClosed: false,
      isLost: false,
      isWon: false,
      name: "E2E Lead",
      slug: "e2e-lead",
      sortOrder: 5,
    },
  });
}

async function main() {
  requireDisposableDatabase();

  const adminEmail = process.env.CRM_E2E_ADMIN_EMAIL ?? defaultAdminEmail;
  const adminPassword = process.env.CRM_E2E_ADMIN_PASSWORD ?? defaultAdminPassword;
  const userEmail = process.env.CRM_E2E_USER_EMAIL ?? defaultUserEmail;
  const userPassword = process.env.CRM_E2E_USER_PASSWORD ?? defaultUserPassword;
  const [admin, user, stage] = await Promise.all([
    upsertUser({
      email: adminEmail,
      name: "E2E Admin",
      password: adminPassword,
      role: "ADMIN",
    }),
    upsertUser({
      email: userEmail,
      name: "E2E User",
      password: userPassword,
      role: "USER",
    }),
    ensurePipelineStage(),
  ]);

  const company = await prisma.company.upsert({
    where: { id: "e2e-company-solarworks" },
    update: {
      city: "York",
      country: "United Kingdom",
      createdByUserId: admin.id,
      domain: "solarworks-e2e.example",
      name: "E2E Solarworks Ltd",
      owner: admin.name,
      postcode: "YO1 7AA",
      status: "Prospect",
    },
    create: {
      id: "e2e-company-solarworks",
      city: "York",
      country: "United Kingdom",
      createdByUserId: admin.id,
      domain: "solarworks-e2e.example",
      name: "E2E Solarworks Ltd",
      owner: admin.name,
      postcode: "YO1 7AA",
      status: "Prospect",
    },
  });

  const phone = "07700 900321";
  const contact = await prisma.contact.upsert({
    where: { id: "e2e-contact-jordan-reeves" },
    update: {
      city: "York",
      companyId: company.id,
      country: "United Kingdom",
      createdByUserId: admin.id,
      email: "jordan.reeves.e2e@example.com",
      firstName: "Jordan",
      lastName: "Reeves",
      leadSource: "Website",
      phone,
      phoneNormalized: normalizedContactPhone(phone),
      postcode: "YO1 7AA",
      role: "Facilities Manager",
    },
    create: {
      id: "e2e-contact-jordan-reeves",
      city: "York",
      companyId: company.id,
      country: "United Kingdom",
      createdByUserId: admin.id,
      email: "jordan.reeves.e2e@example.com",
      firstName: "Jordan",
      lastName: "Reeves",
      leadSource: "Website",
      phone,
      phoneNormalized: normalizedContactPhone(phone),
      postcode: "YO1 7AA",
      role: "Facilities Manager",
    },
  });

  const opportunity = await prisma.salesOpportunity.upsert({
    where: { id: "e2e-sale-rooftop-solar" },
    update: {
      companyId: company.id,
      contactId: contact.id,
      currency: "GBP",
      nextStep: "Book E2E survey",
      ownerId: admin.id,
      probability: 10,
      salesPipelineStageId: stage.id,
      source: "Website",
      stage: "LEAD",
      title: "E2E Rooftop Solar Enquiry",
      valueCents: 1250000,
    },
    create: {
      id: "e2e-sale-rooftop-solar",
      companyId: company.id,
      contactId: contact.id,
      currency: "GBP",
      nextStep: "Book E2E survey",
      ownerId: admin.id,
      probability: 10,
      salesPipelineStageId: stage.id,
      source: "Website",
      stage: "LEAD",
      title: "E2E Rooftop Solar Enquiry",
      valueCents: 1250000,
    },
  });

  const task = await prisma.task.upsert({
    where: { id: "e2e-task-follow-up" },
    update: {
      assigneeId: admin.id,
      companyId: company.id,
      contactId: contact.id,
      creatorId: admin.id,
      description: "Disposable E2E follow-up task.",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "TODO",
      title: "E2E follow up with Jordan",
    },
    create: {
      id: "e2e-task-follow-up",
      assigneeId: admin.id,
      companyId: company.id,
      contactId: contact.id,
      creatorId: admin.id,
      description: "Disposable E2E follow-up task.",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "TODO",
      title: "E2E follow up with Jordan",
    },
  });

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: {
      companiesEnabled: true,
    },
    create: {
      companiesEnabled: true,
      id: "default",
    },
  });

  console.log(
    JSON.stringify(
      {
        admin: { email: admin.email },
        company: { id: company.id, name: company.name },
        contact: { email: contact.email, id: contact.id },
        opportunity: { id: opportunity.id, title: opportunity.title },
        task: { id: task.id, title: task.title },
        user: { email: user.email },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown E2E prep error.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
