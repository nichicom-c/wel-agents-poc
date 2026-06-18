export const KNOWLEDGE_BASE_DOMAINS = [
  "database",
  "document",
  "law",
  "medical_care_law",
  "support_activity",
] as const;

export type KnowledgeBaseDomain = (typeof KNOWLEDGE_BASE_DOMAINS)[number];

export type KnowledgeBaseIds = Record<KnowledgeBaseDomain, string | undefined>;

export type KnowledgeBaseSummary = {
  createdAt?: string;
  description?: string;
  failureReasons?: string[];
  knowledgeBaseArn?: string;
  knowledgeBaseId: string;
  name?: string;
  roleArn?: string;
  status?: string;
  storage?: unknown;
  type?: string;
  updatedAt?: string;
  vectorConfiguration?: unknown;
  sqlConfiguration?: unknown;
};

export type KnowledgeBaseDataSourceSummary = {
  dataSourceId: string;
  description?: string;
  knowledgeBaseId: string;
  name?: string;
  status?: string;
  updatedAt?: string;
};

export type KnowledgeBaseDocumentIdentifier = {
  customId?: string;
  dataSourceType?: string;
  s3Uri?: string;
};

export type KnowledgeBaseDocumentSummary = {
  dataSourceId: string;
  identifier: KnowledgeBaseDocumentIdentifier;
  knowledgeBaseId: string;
  status?: string;
  statusReason?: string;
  updatedAt?: string;
};

export type KnowledgeBaseOverviewResponse = {
  dataSources: KnowledgeBaseDataSourceSummary[];
  domain: KnowledgeBaseDomain;
  knowledgeBase: KnowledgeBaseSummary;
  knowledgeBaseId: string;
  nextToken?: string;
};

export type KnowledgeBaseDocumentsResponse = {
  dataSourceId: string;
  documents: KnowledgeBaseDocumentSummary[];
  domain: KnowledgeBaseDomain;
  knowledgeBaseId: string;
  nextToken?: string;
};

export function isKnowledgeBaseDomain(
  value: string,
): value is KnowledgeBaseDomain {
  return KNOWLEDGE_BASE_DOMAINS.includes(value as KnowledgeBaseDomain);
}
