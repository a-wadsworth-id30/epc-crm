import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnvFile } from "node:process";
import { normalizedContactPhone } from "../src/lib/phone-normalization";

loadEnvFile(".env");

const prisma = new PrismaClient();
const defaultSeedAdminEmail = "admin@example.com";
const defaultSeedAdminPassword = "ChangeMe123!";

function isLocalDatabaseUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

function requiresExplicitSeedCredentials() {
  return (
    process.env.NODE_ENV === "production" ||
    !isLocalDatabaseUrl(process.env.DATABASE_URL)
  );
}

function validateSeedCredentials() {
  if (!requiresExplicitSeedCredentials()) return;

  const missing = [
    process.env.SEED_ADMIN_EMAIL ? null : "SEED_ADMIN_EMAIL",
    process.env.SEED_ADMIN_PASSWORD ? null : "SEED_ADMIN_PASSWORD",
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `Refusing to seed a production-like database without ${missing.join(", ")}.`,
    );
  }

  if (process.env.SEED_ADMIN_PASSWORD === defaultSeedAdminPassword) {
    throw new Error(
      "Refusing to seed a production-like database with the default admin password.",
    );
  }
}

async function main() {
  validateSeedCredentials();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? defaultSeedAdminEmail;
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? defaultSeedAdminPassword;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Default Admin";
  const adminMobile = process.env.SEED_ADMIN_MOBILE ?? "07700900123";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      firstName: "Default",
      lastName: "Admin",
      mobile: adminMobile,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      voiceRoutingMode: "BROWSER",
      voiceExtension: "1001",
    },
    create: {
      name: adminName,
      firstName: "Default",
      lastName: "Admin",
      mobile: adminMobile,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      voiceRoutingMode: "BROWSER",
      voiceExtension: "1001",
    },
  });

  const defaultPipelineStages = [
    {
      id: "sales-pipeline-stage-lead",
      name: "Lead",
      slug: "lead",
      bucket: "LEAD",
      customerSalesCategory: "ENQUIRY",
      sortOrder: 10,
      defaultProbability: 10,
      isActive: true,
      isClosed: false,
      isWon: false,
      isLost: false,
      color: "#6B7280",
      description: "New enquiry or unqualified sales opportunity.",
    },
    {
      id: "sales-pipeline-stage-qualified",
      name: "Qualified",
      slug: "qualified",
      bucket: "QUALIFIED",
      customerSalesCategory: "OPPORTUNITY",
      sortOrder: 20,
      defaultProbability: 25,
      isActive: true,
      isClosed: false,
      isWon: false,
      isLost: false,
      color: "#2563EB",
      description: "Qualified customer ready to scope or quote.",
    },
    {
      id: "sales-pipeline-stage-proposal",
      name: "Proposal",
      slug: "proposal",
      bucket: "PROPOSAL",
      customerSalesCategory: "OPPORTUNITY",
      sortOrder: 30,
      defaultProbability: 45,
      isActive: true,
      isClosed: false,
      isWon: false,
      isLost: false,
      color: "#0BA5EC",
      description: "Proposal or quote issued to the customer.",
    },
    {
      id: "sales-pipeline-stage-negotiation",
      name: "Negotiation",
      slug: "negotiation",
      bucket: "NEGOTIATION",
      customerSalesCategory: "OPPORTUNITY",
      sortOrder: 40,
      defaultProbability: 75,
      isActive: true,
      isClosed: false,
      isWon: false,
      isLost: false,
      color: "#D97706",
      description: "Customer is negotiating scope, price or timing.",
    },
    {
      id: "sales-pipeline-stage-won",
      name: "Won",
      slug: "won",
      bucket: "WON",
      customerSalesCategory: "PROJECT",
      sortOrder: 50,
      defaultProbability: 100,
      isActive: true,
      isClosed: true,
      isWon: true,
      isLost: false,
      color: "#059669",
      description: "Confirmed order that has become a customer project.",
    },
    {
      id: "sales-pipeline-stage-lost",
      name: "Lost",
      slug: "lost",
      bucket: "LOST",
      customerSalesCategory: "OPPORTUNITY",
      sortOrder: 60,
      defaultProbability: 0,
      isActive: true,
      isClosed: true,
      isWon: false,
      isLost: true,
      color: "#DC2626",
      description: "Closed lost opportunity.",
    },
  ] as const;

  const pipelineStages = await Promise.all(
    defaultPipelineStages.map((stage) =>
      prisma.salesPipelineStage.upsert({
        where: { slug: stage.slug },
        update: {
          name: stage.name,
          bucket: stage.bucket,
          customerSalesCategory: stage.customerSalesCategory,
          sortOrder: stage.sortOrder,
          defaultProbability: stage.defaultProbability,
          isActive: stage.isActive,
          isClosed: stage.isClosed,
          isWon: stage.isWon,
          isLost: stage.isLost,
          color: stage.color,
          description: stage.description,
          metadata: { default: true, legacyStage: stage.bucket },
        },
        create: {
          ...stage,
          metadata: { default: true, legacyStage: stage.bucket },
        },
      }),
    ),
  );
  const pipelineStageByBucket = Object.fromEntries(
    pipelineStages.map((stage) => [stage.bucket, stage.id]),
  );

  const company = await prisma.company.upsert({
    where: { id: "seed-company-acme" },
    update: {},
    create: {
      id: "seed-company-acme",
      name: "Acme Client Group",
      domain: "acme.example",
      status: "Active",
      owner: admin.name,
    },
  });

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", companiesEnabled: true },
  });

  const contact = await prisma.contact.upsert({
    where: { id: "seed-contact-sam-taylor" },
    update: {
      firstName: "Sam",
      lastName: "Taylor",
      email: "sam.taylor@acme.example",
      role: "Operations Lead",
      companyId: company.id,
      companyName: company.name,
    },
    create: {
      id: "seed-contact-sam-taylor",
      firstName: "Sam",
      lastName: "Taylor",
      email: "sam.taylor@acme.example",
      role: "Operations Lead",
      companyId: company.id,
      companyName: company.name,
    },
  });

  const acmeOpportunityData = {
    title: "Acme CRM implementation",
    stage: "PROPOSAL" as const,
    customerSalesCategory: "OPPORTUNITY" as const,
    salesPipelineStageId: pipelineStageByBucket.PROPOSAL,
    valueCents: 1850000,
    currency: "GBP",
    probability: 60,
    source: "Referral",
    nextStep: "Review proposal and confirm implementation scope.",
    expectedCloseDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    ownerId: admin.id,
    companyId: company.id,
    contactId: contact.id,
  };
  const existingAcmeOpportunity = await prisma.salesOpportunity.findFirst({
    where: {
      OR: [
        { id: "seed-opportunity-acme-implementation" },
        { title: acmeOpportunityData.title, contactId: contact.id },
      ],
    },
  });

  await (existingAcmeOpportunity
    ? prisma.salesOpportunity.update({
        where: { id: existingAcmeOpportunity.id },
        data: acmeOpportunityData,
      })
    : prisma.salesOpportunity.create({ data: acmeOpportunityData }));

  const existingAdminContact = await prisma.contact.findFirst({
    where: { email: admin.email },
  });
  const adminContact = existingAdminContact
    ? await prisma.contact.update({
        where: { id: existingAdminContact.id },
        data: {
          firstName: admin.firstName ?? "Default",
          lastName: admin.lastName ?? "Admin",
          email: admin.email,
          phone: admin.mobile ?? adminMobile,
          phoneNormalized: normalizedContactPhone(admin.mobile ?? adminMobile),
          role: "Primary contact",
        },
      })
    : await prisma.contact.create({
        data: {
          id: "seed-contact-primary-admin",
          firstName: admin.firstName ?? "Default",
          lastName: admin.lastName ?? "Admin",
          email: admin.email,
          phone: admin.mobile ?? adminMobile,
          phoneNormalized: normalizedContactPhone(admin.mobile ?? adminMobile),
          role: "Primary contact",
        },
      });

  const adminOpportunityData = {
    title: "Website enquiry follow-up",
    stage: "QUALIFIED" as const,
    customerSalesCategory: "OPPORTUNITY" as const,
    salesPipelineStageId: pipelineStageByBucket.QUALIFIED,
    valueCents: 0,
    currency: "GBP",
    probability: 35,
    source: "Website",
    nextStep: "Call the contact to confirm requirements and agree quote scope.",
    expectedCloseDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    ownerId: admin.id,
    contactId: adminContact.id,
    companyId: adminContact.companyId,
  };
  const existingAdminOpportunity = await prisma.salesOpportunity.findFirst({
    where: {
      OR: [
        { id: "seed-opportunity-david-website-enquiry" },
        { id: "seed-opportunity-primary-website-enquiry" },
        { title: adminOpportunityData.title, contactId: adminContact.id },
      ],
    },
  });

  const adminOpportunity = existingAdminOpportunity
    ? await prisma.salesOpportunity.update({
        where: { id: existingAdminOpportunity.id },
        data: adminOpportunityData,
      })
    : await prisma.salesOpportunity.create({ data: adminOpportunityData });

  const salesCommunications = [
    {
      id: "seed-sales-communication-primary-website-inbound",
      channel: "EMAIL" as const,
      direction: "INBOUND" as const,
      subject: "Website enquiry received",
      summary: "Online enquiry created the contact and sales record.",
      body: "Customer submitted a website enquiry. Basic details were validated before creating the CRM sale.",
      fromAddress: admin.email,
      toAddress: "sales@id30.example",
      occurredAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
    {
      id: "seed-sales-communication-primary-sms-outbound",
      channel: "SMS" as const,
      direction: "OUTBOUND" as const,
      subject: "Booking prompt sent",
      summary:
        "Sent an SMS asking the customer to choose a suitable time for a call.",
      body: "Thanks for your enquiry. We will call to confirm the details so we can prepare an accurate quote.",
      fromAddress: "Twilio",
      toAddress: adminContact.phone,
      occurredAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      id: "seed-sales-communication-primary-call-planned",
      channel: "PHONE" as const,
      direction: "OUTBOUND" as const,
      subject: "Telephone qualification call",
      summary:
        "Next action is to call the customer and confirm the quote requirements.",
      body: "Use this call to confirm the brief, urgency, budget range and any site-specific constraints.",
      fromAddress: admin.mobile ?? "CRM softphone",
      toAddress: adminContact.phone,
      occurredAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  ];

  for (const item of salesCommunications) {
    await prisma.salesCommunication.upsert({
      where: { id: item.id },
      update: {
        opportunityId: adminOpportunity.id,
        contactId: adminContact.id,
        userId: admin.id,
        channel: item.channel,
        direction: item.direction,
        subject: item.subject,
        summary: item.summary,
        body: item.body,
        fromAddress: item.fromAddress,
        toAddress: item.toAddress,
        occurredAt: item.occurredAt,
      },
      create: {
        ...item,
        opportunityId: adminOpportunity.id,
        contactId: adminContact.id,
        userId: admin.id,
      },
    });
  }

  const productCategories = [
    {
      id: "product-category-websites",
      name: "Websites",
      slug: "websites",
      description: "Website, ecommerce and web application services.",
      sortOrder: 10,
    },
    {
      id: "product-category-brand",
      name: "Brand",
      slug: "brand",
      description: "Brand identity, design systems and creative production.",
      sortOrder: 20,
    },
    {
      id: "product-category-marketing",
      name: "Marketing",
      slug: "marketing",
      description:
        "Digital marketing, SEO, paid media and conversion services.",
      sortOrder: 30,
    },
  ] as const;

  for (const category of productCategories) {
    await prisma.productCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: category,
    });
  }

  const products = [
    {
      id: "product-ecommerce-website",
      name: "Ecommerce website",
      slug: "ecommerce-website",
      type: "SERVICE" as const,
      categoryId: "product-category-websites",
      sku: "ID30-ECOM",
      description: "Discovery, design and build for ecommerce websites.",
      sortOrder: 10,
    },
    {
      id: "product-brand-identity",
      name: "Brand identity",
      slug: "brand-identity",
      type: "SERVICE" as const,
      categoryId: "product-category-brand",
      sku: "ID30-BRAND",
      description: "Logo, visual identity and brand guideline projects.",
      sortOrder: 20,
    },
    {
      id: "product-digital-marketing",
      name: "Digital marketing",
      slug: "digital-marketing",
      type: "SERVICE" as const,
      categoryId: "product-category-marketing",
      sku: "ID30-MKT",
      description: "SEO, paid media and performance marketing retainers.",
      sortOrder: 30,
    },
  ] as const;

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        type: product.type,
        categoryId: product.categoryId,
        sku: product.sku,
        description: product.description,
        sortOrder: product.sortOrder,
        isActive: true,
      },
      create: product,
    });
  }

  const discoveryQuestions = [
    {
      id: "discovery-question-products-required",
      slug: "products-required",
      label: "Products",
      helpText:
        "Select from the product catalogue. Selected products are attached to the lead and can pull in product discovery packs.",
      scope: "OPPORTUNITY" as const,
      answerType: "PRODUCT_MULTI_SELECT" as const,
      answerMode: "MULTIPLE_UNLIMITED" as const,
      defaultRequired: true,
      dedupeKey: "products-required",
      sortOrder: 5,
    },
    {
      id: "discovery-question-categories-required",
      slug: "categories-required",
      label: "Categories",
      helpText:
        "Use this when the customer knows the broad area before the exact product is confirmed.",
      scope: "OPPORTUNITY" as const,
      answerType: "CATEGORY_MULTI_SELECT" as const,
      answerMode: "MULTIPLE_UNLIMITED" as const,
      defaultRequired: false,
      dedupeKey: "categories-required",
      sortOrder: 8,
    },
    {
      id: "discovery-question-customer-sells-provides",
      slug: "customer-sells-provides",
      label: "What they sell/provide?",
      helpText:
        "Plain-English summary of what the customer sells, provides or needs to promote.",
      scope: "OPPORTUNITY" as const,
      answerType: "TEXT" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: true,
      dedupeKey: "customer-sells-provides",
      sortOrder: 10,
    },
    {
      id: "discovery-question-budget",
      slug: "budget",
      label: "What budget range should we work to?",
      helpText:
        "Lead-level commercial qualification shared across all products.",
      scope: "OPPORTUNITY" as const,
      answerType: "CURRENCY" as const,
      defaultRequired: true,
      dedupeKey: "budget",
      sortOrder: 10,
    },
    {
      id: "discovery-question-budget-range",
      slug: "budget-range",
      label: "Budget",
      helpText:
        "Lead-level budget range. Use the closest option or select another currency/to confirm.",
      scope: "OPPORTUNITY" as const,
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      options: [
        "Under £2,500",
        "£2,500-£5,000",
        "£5,000-£10,000",
        "£10,000-£20,000",
        "£20,000+",
        "Other currency / to confirm",
      ],
      defaultRequired: true,
      dedupeKey: "budget-range",
      sortOrder: 20,
    },
    {
      id: "discovery-question-timeline",
      slug: "timeline",
      label: "When does the client need this completed?",
      helpText: "Lead-level delivery urgency and target launch date.",
      scope: "OPPORTUNITY" as const,
      answerType: "TEXT" as const,
      defaultRequired: true,
      dedupeKey: "timeline",
      sortOrder: 20,
    },
    {
      id: "discovery-question-timeframe",
      slug: "timeframe",
      label: "Timeframe",
      helpText: "Lead-level project urgency and target timing.",
      scope: "OPPORTUNITY" as const,
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      options: [
        "Within the next 3 months",
        "Within the next 6 months",
        "Not sure yet",
        "We need urgent help",
      ],
      defaultRequired: true,
      dedupeKey: "timeframe",
      sortOrder: 30,
    },
    {
      id: "discovery-question-project-notes",
      slug: "project-notes",
      label: "Project notes",
      helpText: "Capture any extra context for the discovery call or quote.",
      scope: "OPPORTUNITY" as const,
      answerType: "LONG_TEXT" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: false,
      dedupeKey: "project-notes",
      sortOrder: 40,
    },
    {
      id: "discovery-question-decision-maker",
      slug: "decision-maker",
      label: "Who signs off the project?",
      helpText:
        "Confirms the commercial decision maker and any other stakeholders.",
      scope: "OPPORTUNITY" as const,
      answerType: "TEXT" as const,
      defaultRequired: false,
      dedupeKey: "decision-maker",
      sortOrder: 30,
    },
    {
      id: "discovery-question-existing-website",
      slug: "existing-website",
      label: "Does the client have an existing website?",
      helpText: "Used to reveal migration, platform and content questions.",
      scope: "OPPORTUNITY" as const,
      answerType: "BOOLEAN" as const,
      defaultRequired: false,
      dedupeKey: "existing-website",
      sortOrder: 40,
    },
    {
      id: "discovery-question-ecommerce-platform",
      slug: "ecommerce-platform",
      label: "Which ecommerce platform is currently used or preferred?",
      scope: "PRODUCT" as const,
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      options: ["Shopify", "WooCommerce", "Magento", "Custom", "Not sure"],
      defaultRequired: true,
      dedupeKey: "ecommerce-platform",
      sortOrder: 100,
    },
    {
      id: "discovery-question-example-sites",
      slug: "example-sites",
      label: "Which example sites do you like?",
      helpText:
        "Capture reference URLs. Start with one URL, then add more if the customer has more examples.",
      scope: "PRODUCT" as const,
      answerType: "URL" as const,
      answerMode: "MULTIPLE_UNLIMITED" as const,
      defaultRequired: false,
      dedupeKey: "example-sites",
      sortOrder: 105,
    },
    {
      id: "discovery-question-product-count",
      slug: "product-count",
      label: "Roughly how many products/SKUs need to be sold online?",
      scope: "PRODUCT" as const,
      answerType: "NUMBER" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: true,
      dedupeKey: "product-count",
      sortOrder: 110,
    },
    {
      id: "discovery-question-payment-shipping",
      slug: "payment-shipping",
      label: "Which payment and shipping requirements are needed?",
      helpText:
        "Examples: Stripe, PayPal, subscriptions, click and collect, courier rules.",
      scope: "PRODUCT" as const,
      answerType: "LONG_TEXT" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: false,
      dedupeKey: "payment-shipping",
      sortOrder: 120,
    },
    {
      id: "discovery-question-brand-guidelines",
      slug: "brand-guidelines",
      label: "Does the client already have brand guidelines?",
      scope: "PRODUCT" as const,
      answerType: "BOOLEAN" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: true,
      dedupeKey: "brand-guidelines",
      sortOrder: 200,
    },
    {
      id: "discovery-question-brand-positioning",
      slug: "brand-positioning",
      label: "How should the brand be perceived?",
      helpText: "Capture the desired tone and positioning.",
      scope: "PRODUCT" as const,
      answerType: "LONG_TEXT" as const,
      answerMode: "SINGLE" as const,
      defaultRequired: true,
      dedupeKey: "brand-positioning",
      sortOrder: 210,
    },
    {
      id: "discovery-question-brand-assets",
      slug: "brand-assets",
      label: "Which brand assets are needed?",
      helpText:
        "Logo, colour palette, typography, icons, social templates, brand guidelines.",
      scope: "PRODUCT" as const,
      answerType: "MULTI_SELECT" as const,
      answerMode: "MULTIPLE_MAX" as const,
      maxAnswers: 6,
      options: [
        "Logo",
        "Colour palette",
        "Typography",
        "Icons",
        "Social templates",
        "Brand guidelines",
      ],
      defaultRequired: true,
      dedupeKey: "brand-assets",
      sortOrder: 220,
    },
    {
      id: "discovery-question-competitor-brands",
      slug: "competitor-brands",
      label: "Which competitor or inspiration brands should we review?",
      helpText:
        "Capture competitor or inspiration URLs. Start with one URL, then add more if needed.",
      scope: "PRODUCT" as const,
      answerType: "URL" as const,
      answerMode: "MULTIPLE_UNLIMITED" as const,
      defaultRequired: false,
      dedupeKey: "competitor-brands",
      sortOrder: 230,
    },
    {
      id: "discovery-question-marketing-goal",
      slug: "marketing-goal",
      label: "What is the primary marketing goal?",
      scope: "PRODUCT" as const,
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      options: [
        "More leads",
        "More sales",
        "Brand awareness",
        "Retain customers",
      ],
      defaultRequired: true,
      dedupeKey: "marketing-goal",
      sortOrder: 300,
    },
  ] as const;

  for (const question of discoveryQuestions) {
    await prisma.discoveryQuestion.upsert({
      where: { slug: question.slug },
      update: {
        label: question.label,
        helpText: "helpText" in question ? question.helpText : null,
        scope: question.scope,
        answerType: question.answerType,
        answerMode: "answerMode" in question ? question.answerMode : "SINGLE",
        maxAnswers: "maxAnswers" in question ? question.maxAnswers : null,
        options: "options" in question ? question.options : undefined,
        defaultRequired: question.defaultRequired,
        dedupeKey: question.dedupeKey,
        sortOrder: question.sortOrder,
        isActive: true,
      },
      create: {
        ...question,
        answerMode: "answerMode" in question ? question.answerMode : "SINGLE",
        maxAnswers: "maxAnswers" in question ? question.maxAnswers : null,
        options: "options" in question ? question.options : undefined,
      },
    });
  }

  const discoveryTemplates = [
    {
      id: "discovery-template-lead-qualification",
      name: "Lead qualification",
      slug: "lead-qualification",
      scope: "LEAD" as const,
      description:
        "Lead-level scope, products, budget and timing that appear on every opportunity.",
      sortOrder: 10,
      questionSlugs: [
        "products-required",
        "categories-required",
        "customer-sells-provides",
        "budget-range",
        "timeframe",
        "project-notes",
      ],
    },
    {
      id: "discovery-template-ecommerce",
      name: "Ecommerce discovery",
      slug: "ecommerce-discovery",
      scope: "PRODUCT" as const,
      description:
        "Questions required when ecommerce is attached to an opportunity.",
      sortOrder: 100,
      productSlug: "ecommerce-website",
      questionSlugs: [
        "example-sites",
        "ecommerce-platform",
        "product-count",
        "payment-shipping",
      ],
    },
    {
      id: "discovery-template-brand",
      name: "Brand discovery",
      slug: "brand-discovery",
      scope: "PRODUCT" as const,
      description: "Questions required for branding and identity work.",
      sortOrder: 200,
      productSlug: "brand-identity",
      questionSlugs: [
        "example-sites",
        "brand-guidelines",
        "brand-positioning",
        "brand-assets",
        "competitor-brands",
      ],
    },
    {
      id: "discovery-template-digital-marketing",
      name: "Digital marketing discovery",
      slug: "digital-marketing-discovery",
      scope: "PRODUCT" as const,
      description: "Questions required for digital marketing opportunities.",
      sortOrder: 300,
      productSlug: "digital-marketing",
      questionSlugs: ["marketing-goal"],
    },
  ] as const;

  const questionBySlug = new Map(
    (await prisma.discoveryQuestion.findMany()).map((question) => [
      question.slug,
      question,
    ]),
  );
  const productBySlug = new Map(
    (await prisma.product.findMany()).map((product) => [product.slug, product]),
  );

  for (const template of discoveryTemplates) {
    const savedTemplate = await prisma.discoveryTemplate.upsert({
      where: { slug: template.slug },
      update: {
        name: template.name,
        scope: template.scope,
        description: template.description,
        isActive: true,
        metadata: { seeded: true, sortOrder: template.sortOrder },
      },
      create: {
        id: template.id,
        name: template.name,
        slug: template.slug,
        scope: template.scope,
        description: template.description,
        metadata: { seeded: true, sortOrder: template.sortOrder },
      },
    });

    for (const [index, questionSlug] of template.questionSlugs.entries()) {
      const question = questionBySlug.get(questionSlug);
      if (!question) continue;

      await prisma.discoveryTemplateQuestion.upsert({
        where: {
          templateId_questionId: {
            templateId: savedTemplate.id,
            questionId: question.id,
          },
        },
        update: {
          sortOrder: (index + 1) * 10,
          required: question.defaultRequired,
        },
        create: {
          templateId: savedTemplate.id,
          questionId: question.id,
          sortOrder: (index + 1) * 10,
          required: question.defaultRequired,
        },
      });
    }

    if ("productSlug" in template) {
      const product = productBySlug.get(template.productSlug);
      if (product) {
        await prisma.productDiscoveryTemplate.upsert({
          where: {
            productId_templateId: {
              productId: product.id,
              templateId: savedTemplate.id,
            },
          },
          update: {},
          create: {
            productId: product.id,
            templateId: savedTemplate.id,
          },
        });
      }
    }
  }

  await prisma.note.create({
    data: {
      body: "Initial discovery completed. Follow up on integration requirements.",
      userId: admin.id,
      companyId: company.id,
      contactId: contact.id,
    },
  });

  await prisma.task.create({
    data: {
      title: "Prepare CRM implementation plan",
      description: "Draft the first implementation milestone for the client.",
      status: "TODO",
      creatorId: admin.id,
      assigneeId: admin.id,
      companyId: company.id,
      contactId: contact.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const integrations = [
    [
      "cloudflare-r2",
      "Cloudflare R2",
      "Object storage for CRM files, uploads, quote packs and call recordings.",
    ],
    [
      "twilio",
      "Twilio",
      "Voice, SMS and WhatsApp communications for CRM conversations.",
    ],
    [
      "mailersend",
      "MailerSend",
      "Transactional email, domain authentication and inbound email routing.",
    ],
    [
      "pipedrive",
      "Pipedrive",
      "Lead inbox import and CRM data synchronisation.",
    ],
    [
      "spruce",
      "Spruce",
      "Inbound Spruce job events and manual CRM sale sends via API.",
    ],
    [
      "email-provider",
      "Email provider",
      "Connect SMTP, Microsoft 365 or Gmail later.",
    ],
    ["calendar", "Calendar", "Synchronise meetings and reminders later."],
    [
      "payments",
      "Payments",
      "Connect Stripe or alternative payment providers later.",
    ],
    [
      "ecommerce",
      "Ecommerce",
      "Connect Shopify, WooCommerce or custom stores later.",
    ],
    [
      "webhooks-api",
      "Webhooks / API",
      "Expose CRM events to external systems later.",
    ],
  ] as const;

  for (const [provider, name, description] of integrations) {
    await prisma.integrationConnection.upsert({
      where: { provider },
      update: { name, description },
      create: { provider, name, description, status: "NOT_CONNECTED" },
    });
  }

  console.log(`Seeded admin user: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
