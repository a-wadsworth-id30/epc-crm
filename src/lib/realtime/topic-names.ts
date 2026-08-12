export const realtimeTopics = {
  inbox: "inbox",
  tasks: "tasks",
  telephony: "telephony",
  contactConversation: (contactId: string) => `conversation:contact:${contactId}`,
  saleConversation: (saleId: string) => `conversation:sale:${saleId}`,
} as const;
