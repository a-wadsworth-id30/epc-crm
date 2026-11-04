export const realtimeTopics = {
  inbox: "inbox",
  notifications: "notifications",
  tasks: "tasks",
  telephony: "telephony",
  contactConversation: (contactId: string) => `conversation:contact:${contactId}`,
  saleConversation: (saleId: string) => `conversation:sale:${saleId}`,
} as const;
