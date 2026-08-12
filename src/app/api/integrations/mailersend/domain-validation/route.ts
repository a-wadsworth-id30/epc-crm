import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refreshMailerSendDomainValidationConfig } from "@/lib/integrations/mailersend";

export async function POST() {
  await requireAdmin();

  try {
    const { config, connected } = await refreshMailerSendDomainValidationConfig();

    return NextResponse.json({
      ok: true,
      connected,
      config: {
        spfHost: config.spfHost,
        spfValue: config.spfValue,
        dkimHost: config.dkimHost,
        dkimValue: config.dkimValue,
        returnPathHost: config.returnPathHost,
        returnPathValue: config.returnPathValue,
        trackingHost: config.trackingHost,
        trackingValue: config.trackingValue,
        inboundMxHost: config.inboundMxHost,
        inboundMxValue: config.inboundMxValue,
        inboundMxPriority: config.inboundMxPriority,
        spfVerified: config.spfVerified,
        dkimVerified: config.dkimVerified,
        returnPathVerified: config.returnPathVerified,
        trackingVerified: config.trackingVerified,
        inboundVerified: config.inboundVerified,
        domainStatus: config.domainStatus,
        lastCheckedAt: config.lastCheckedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "MailerSend domain validation refresh failed.",
      },
      { status: 400 },
    );
  }
}
