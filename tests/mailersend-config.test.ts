import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

let mailerSend: typeof import("../src/lib/integrations/mailersend");

before(async () => {
  moduleWithLoad._load = function loadWithMailerSendStubs(
    this: unknown,
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === "server-only") {
      return {};
    }

    if (request === "@/lib/crypto/secrets") {
      return { decryptSecret: (value: string) => value };
    }

    if (request === "@/lib/prisma") {
      return {
        prisma: {
          integrationConnection: {
            findUnique: async () => null,
          },
        },
      };
    }

    return Reflect.apply(originalLoad, this, [request, parent, isMain]);
  };

  try {
    mailerSend = await import("../src/lib/integrations/mailersend");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
});

describe("MailerSend config schema", () => {
  it("normalizes null optional values from settings form submissions", () => {
    const parsed = mailerSend.mailerSendSettingsFormSchema.safeParse({
      domainName: "epc-improvements.co.uk",
      domainId: null,
      fromName: null,
      fromEmail: null,
      replyToEmail: null,
      inboundDomain: null,
      inboundRouteId: null,
      inboundRouteName: null,
      inboundCatchRecipient: null,
      webhookBaseUrl: null,
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    assert.equal(parsed.data.domainName, "epc-improvements.co.uk");
    assert.equal(parsed.data.domainId, "");
    assert.equal(parsed.data.fromEmail, "");
    assert.equal(parsed.data.webhookBaseUrl, "");
  });

  it("keeps DNS validation fields out of the settings form payload", () => {
    const parsed = mailerSend.mailerSendSettingsFormSchema.safeParse({
      domainName: "epc-improvements.co.uk",
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    assert.equal("spfHost" in parsed.data, false);
    assert.equal("dkimValue" in parsed.data, false);
    assert.equal("returnPathHost" in parsed.data, false);
  });

  it("accepts null stored DNS values from older saved configs", () => {
    const parsed = mailerSend.mailerSendConfigSchema.safeParse({
      domainName: "epc-improvements.co.uk",
      spfHost: null,
      spfValue: null,
      dkimHost: null,
      dkimValue: null,
      returnPathHost: null,
      returnPathValue: null,
      trackingHost: null,
      trackingValue: null,
      inboundMxHost: null,
      inboundMxValue: null,
      domainStatus: null,
      lastCheckedAt: null,
    });

    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    assert.equal(parsed.data.spfHost, "");
    assert.equal(parsed.data.returnPathValue, "");
    assert.equal(parsed.data.lastCheckedAt, "");
  });
});
