"use client";

import { PhoneIcon } from "@/components/crm-boilerplate/SoftphoneIcons";
import { triggerSoftphoneDial } from "@/lib/telephony/softphone-dial";

export default function SaleCallButton({
  phone,
  contactName,
  saleTitle,
  opportunityId,
  contactId,
}: {
  phone: string;
  contactName: string;
  saleTitle: string;
  opportunityId: string;
  contactId?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        triggerSoftphoneDial(phone, contactName, {
          contextName: saleTitle,
          opportunityId,
          contactId: contactId ?? undefined,
        })
      }
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
    >
      <PhoneIcon className="h-4 w-4" />
      Call customer
    </button>
  );
}
