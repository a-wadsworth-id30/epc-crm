export type CrmSearchRecordType = "company" | "contact" | "sale" | "user";

export type CrmSearchRecord = {
  id: string;
  type: CrmSearchRecordType;
  title: string;
  subtitle: string | null;
  description: string | null;
  href: string;
  score: number;
};

export type CrmSearchResponse = {
  query: string;
  records: CrmSearchRecord[];
};
