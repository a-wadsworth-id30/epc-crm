import { PrismaClient } from "@prisma/client";
import { loadEnvFile } from "node:process";
import { normalizedContactPhone } from "../src/lib/phone-normalization";

loadEnvFile(".env");

const prisma = new PrismaClient();

const ids = {
  company: "test-attribution-company",
  contact: "test-attribution-contact",
  opportunity: "test-attribution-sale",
  snapshot: "test-attribution-snapshot",
  attributionRecord: "test-attribution-record",
  callLog: "test-attribution-call-log",
  communication: "test-attribution-communication",
};

const visitorId = "visitor_test_attribution_001";
const sessionId = "session_test_attribution_001";
const now = new Date();
const firstTouchAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
const lastTouchAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
const landingPage = "https://id30.com/test-landing-page";
const currentPage = "https://id30.com/contact";
const referrer = "https://www.google.com/";
const trackingPhoneNumber = "+442012340999";

const firstTouch = {
  url: landingPage,
  landingPage,
  referrer,
  timestamp: firstTouchAt.toISOString(),
  params: {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "test-crm-attribution",
    utm_term: "crm call tracking",
    gclid: "test-gclid-123",
  },
};

const lastTouch = {
  url: currentPage,
  referrer: landingPage,
  timestamp: lastTouchAt.toISOString(),
  params: {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "test-crm-attribution",
    gclid: "test-gclid-123",
  },
};

const attribution = {
  visitorId,
  sessionId,
  firstTouch,
  lastTouch,
  timeline: [firstTouch, lastTouch],
  landingPage,
  currentPage,
  referrer,
  metadata: {
    source: "Google Ads",
    channel: "Paid Search",
    campaign: "test-crm-attribution",
  },
  sourceMetadata: {
    source: "Google Ads",
    channel: "Paid Search",
    campaign: "test-crm-attribution",
  },
};

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  const company = await prisma.company.upsert({
    where: { id: ids.company },
    update: {
      name: "Attribution Test Company",
      domain: "attribution-test.example",
      status: "Prospect",
      owner: admin?.name ?? "CRM",
    },
    create: {
      id: ids.company,
      name: "Attribution Test Company",
      domain: "attribution-test.example",
      status: "Prospect",
      owner: admin?.name ?? "CRM",
    },
  });

  const contact = await prisma.contact.upsert({
    where: { id: ids.contact },
    update: {
      firstName: "Attribution",
      lastName: "Test Lead",
      email: "attribution.test@example.com",
      phone: "+447700900321",
      phoneNormalized: normalizedContactPhone("+447700900321"),
      role: "Marketing lead",
      companyId: company.id,
      companyName: company.name,
      attribution,
    },
    create: {
      id: ids.contact,
      firstName: "Attribution",
      lastName: "Test Lead",
      email: "attribution.test@example.com",
      phone: "+447700900321",
      phoneNormalized: normalizedContactPhone("+447700900321"),
      role: "Marketing lead",
      companyId: company.id,
      companyName: company.name,
      attribution,
    },
  });

  const opportunity = await prisma.salesOpportunity.upsert({
    where: { id: ids.opportunity },
    update: {
      title: "Test Attribution Sale",
      stage: "QUALIFIED",
      valueCents: 1250000,
      currency: "GBP",
      probability: 45,
      source: "Google Ads",
      nextStep: "Use this record to verify sale-level attribution display.",
      expectedCloseDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      ownerId: admin?.id ?? null,
      companyId: company.id,
      contactId: contact.id,
      attribution,
    },
    create: {
      id: ids.opportunity,
      title: "Test Attribution Sale",
      stage: "QUALIFIED",
      valueCents: 1250000,
      currency: "GBP",
      probability: 45,
      source: "Google Ads",
      nextStep: "Use this record to verify sale-level attribution display.",
      expectedCloseDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      ownerId: admin?.id ?? null,
      companyId: company.id,
      contactId: contact.id,
      attribution,
    },
  });

  await prisma.attributionSnapshot.upsert({
    where: {
      visitorId_sessionId: {
        visitorId,
        sessionId,
      },
    },
    update: {
      firstTouch,
      lastTouch,
      timeline: [firstTouch, lastTouch],
      landingPage,
      currentPage,
      referrer,
      userAgent: "iD30 CRM attribution seed",
      ipAddress: "127.0.0.1",
    },
    create: {
      id: ids.snapshot,
      visitorId,
      sessionId,
      firstTouch,
      lastTouch,
      timeline: [firstTouch, lastTouch],
      landingPage,
      currentPage,
      referrer,
      userAgent: "iD30 CRM attribution seed",
      ipAddress: "127.0.0.1",
    },
  });

  await prisma.callLog.upsert({
    where: { id: ids.callLog },
    update: {
      direction: "INBOUND",
      status: "COMPLETED",
      fromNumber: contact.phone,
      toNumber: trackingPhoneNumber,
      durationSeconds: 184,
      provider: "twilio",
      metadata: {
        seeded: true,
        trackingPhoneNumber,
        campaign: "test-crm-attribution",
      },
      attribution,
      contactId: contact.id,
      opportunityId: opportunity.id,
      startedAt: new Date(now.getTime() - 90 * 60 * 1000),
      answeredAt: new Date(now.getTime() - 89 * 60 * 1000),
      endedAt: new Date(now.getTime() - 86 * 60 * 1000),
    },
    create: {
      id: ids.callLog,
      direction: "INBOUND",
      status: "COMPLETED",
      fromNumber: contact.phone,
      toNumber: trackingPhoneNumber,
      durationSeconds: 184,
      provider: "twilio",
      metadata: {
        seeded: true,
        trackingPhoneNumber,
        campaign: "test-crm-attribution",
      },
      attribution,
      contactId: contact.id,
      opportunityId: opportunity.id,
      startedAt: new Date(now.getTime() - 90 * 60 * 1000),
      answeredAt: new Date(now.getTime() - 89 * 60 * 1000),
      endedAt: new Date(now.getTime() - 86 * 60 * 1000),
    },
  });

  await prisma.attributionRecord.upsert({
    where: { id: ids.attributionRecord },
    update: {
      source: "PHONE",
      attributionSnapshotId: ids.snapshot,
      visitorId,
      sessionId,
      contactId: contact.id,
      opportunityId: opportunity.id,
      callLogId: ids.callLog,
      firstTouch,
      lastTouch,
      timeline: [firstTouch, lastTouch],
      landingPage,
      currentPage,
      referrer,
      trackingPhoneNumber,
      metadata: attribution,
    },
    create: {
      id: ids.attributionRecord,
      source: "PHONE",
      attributionSnapshotId: ids.snapshot,
      visitorId,
      sessionId,
      contactId: contact.id,
      opportunityId: opportunity.id,
      callLogId: ids.callLog,
      firstTouch,
      lastTouch,
      timeline: [firstTouch, lastTouch],
      landingPage,
      currentPage,
      referrer,
      trackingPhoneNumber,
      metadata: attribution,
    },
  });

  await prisma.salesCommunication.upsert({
    where: { id: ids.communication },
    update: {
      opportunityId: opportunity.id,
      channel: "PHONE",
      direction: "INBOUND",
      subject: "Seeded attributed inbound call",
      summary: "Inbound call from the Google Ads test campaign created for attribution UI testing.",
      body: "Use this test activity with the linked attribution record and call log to verify sale-level tracking information.",
      fromAddress: contact.phone,
      toAddress: trackingPhoneNumber,
      contactId: contact.id,
      userId: admin?.id ?? null,
      occurredAt: new Date(now.getTime() - 85 * 60 * 1000),
      metadata: {
        seeded: true,
        attributionRecordId: ids.attributionRecord,
        callLogId: ids.callLog,
      },
    },
    create: {
      id: ids.communication,
      opportunityId: opportunity.id,
      channel: "PHONE",
      direction: "INBOUND",
      subject: "Seeded attributed inbound call",
      summary: "Inbound call from the Google Ads test campaign created for attribution UI testing.",
      body: "Use this test activity with the linked attribution record and call log to verify sale-level tracking information.",
      fromAddress: contact.phone,
      toAddress: trackingPhoneNumber,
      contactId: contact.id,
      userId: admin?.id ?? null,
      occurredAt: new Date(now.getTime() - 85 * 60 * 1000),
      metadata: {
        seeded: true,
        attributionRecordId: ids.attributionRecord,
        callLogId: ids.callLog,
      },
    },
  });

  console.log("Seeded attribution test sale.");
  console.log(`Sale: ${opportunity.title}`);
  console.log(`Sale ID: ${opportunity.id}`);
  console.log(`Contact: ${contact.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
