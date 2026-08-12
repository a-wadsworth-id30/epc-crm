import type { Prisma } from "@prisma/client";
import { bumpRealtimeTopics, realtimeTopics } from "@/lib/realtime/topics";

type CallRealtimeFields = {
  contactId?: string | null;
  id?: string | null;
  opportunityId?: string | null;
};

export async function bumpCallRealtimeTopics(call?: CallRealtimeFields | null) {
  await bumpRealtimeTopics([
    realtimeTopics.telephony,
    realtimeTopics.tasks,
    call?.opportunityId ? realtimeTopics.saleConversation(call.opportunityId) : null,
    call?.contactId ? realtimeTopics.contactConversation(call.contactId) : null,
  ]);
}

export function callRealtimeSelect() {
  return {
    contactId: true,
    id: true,
    opportunityId: true,
  } satisfies Prisma.CallLogSelect;
}
