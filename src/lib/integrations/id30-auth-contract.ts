export const supportedId30AuthContractVersion = 1 as const;

export const requiredGmailPushCapabilities = [
  "gmail.push.v1",
  "gmail.watch.v1",
  "provider-diagnostics.v1",
  "signed-requests.v1",
] as const;

export type Id30AuthContractDescriptor = {
  capabilities: string[];
  minimumCompatibleVersion: number;
  name: string;
  version: number;
};

export function id30AuthContractCompatibility(
  contract: Id30AuthContractDescriptor | null | undefined,
  requiredCapabilities: readonly string[] = [],
) {
  if (!contract) {
    return {
      compatible: false as const,
      message: "iD30 Auth did not report a CRM contract version.",
      missingCapabilities: [...requiredCapabilities],
    };
  }

  if (contract.name !== "id30-auth-crm") {
    return {
      compatible: false as const,
      message: "iD30 Auth reported an unknown CRM contract.",
      missingCapabilities: [...requiredCapabilities],
    };
  }

  if (
    contract.minimumCompatibleVersion > supportedId30AuthContractVersion ||
    contract.version < supportedId30AuthContractVersion
  ) {
    return {
      compatible: false as const,
      message: `CRM supports Auth contract v${supportedId30AuthContractVersion}; Auth requires v${contract.minimumCompatibleVersion} and reports v${contract.version}.`,
      missingCapabilities: [...requiredCapabilities],
    };
  }

  const available = new Set(contract.capabilities);
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !available.has(capability),
  );

  if (missingCapabilities.length) {
    return {
      compatible: false as const,
      message: `iD30 Auth is missing required capabilities: ${missingCapabilities.join(", ")}.`,
      missingCapabilities,
    };
  }

  return {
    compatible: true as const,
    message: `iD30 Auth CRM contract v${contract.version} is compatible.`,
    missingCapabilities: [],
  };
}
