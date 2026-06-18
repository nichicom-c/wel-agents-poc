import {
  BedrockAgentClient,
  GetKnowledgeBaseCommand,
  type GetKnowledgeBaseCommandOutput,
  ListDataSourcesCommand,
  type ListDataSourcesCommandOutput,
  ListKnowledgeBaseDocumentsCommand,
  type ListKnowledgeBaseDocumentsCommandOutput,
} from "@aws-sdk/client-bedrock-agent";

import type {
  KnowledgeBaseDetailProvider,
  KnowledgeBaseDocumentsInput,
  KnowledgeBaseOverviewInput,
} from "../application/handle-knowledge-base-detail-request.ts";
import type {
  KnowledgeBaseDataSourceSummary,
  KnowledgeBaseDocumentSummary,
  KnowledgeBaseDocumentsResponse,
  KnowledgeBaseOverviewResponse,
  KnowledgeBaseSummary,
} from "../contracts/knowledge-base-detail.ts";

export interface BedrockAgentMetadataClient {
  send(
    command: GetKnowledgeBaseCommand,
  ): Promise<GetKnowledgeBaseCommandOutput>;
  send(command: ListDataSourcesCommand): Promise<ListDataSourcesCommandOutput>;
  send(
    command: ListKnowledgeBaseDocumentsCommand,
  ): Promise<ListKnowledgeBaseDocumentsCommandOutput>;
}

export type MakeKnowledgeBaseDetailProviderOptions = {
  client?: BedrockAgentMetadataClient;
  region?: string;
};

export function makeKnowledgeBaseDetailProvider({
  client,
  region,
}: MakeKnowledgeBaseDetailProviderOptions = {}): KnowledgeBaseDetailProvider {
  const metadataClient =
    client ?? new BedrockAgentClient(region ? { region } : {});

  return {
    getOverview: (input) => getKnowledgeBaseOverview(metadataClient, input),
    listDocuments: (input) => listKnowledgeBaseDocuments(metadataClient, input),
  };
}

async function getKnowledgeBaseOverview(
  client: BedrockAgentMetadataClient,
  { domain, knowledgeBaseId }: KnowledgeBaseOverviewInput,
): Promise<KnowledgeBaseOverviewResponse> {
  const [knowledgeBaseResponse, dataSourcesResponse] = await Promise.all([
    client.send(new GetKnowledgeBaseCommand({ knowledgeBaseId })),
    client.send(
      new ListDataSourcesCommand({ knowledgeBaseId, maxResults: 100 }),
    ),
  ]);

  return {
    dataSources:
      dataSourcesResponse.dataSourceSummaries?.map(formatDataSourceSummary) ??
      [],
    domain,
    knowledgeBase: formatKnowledgeBase(knowledgeBaseResponse),
    knowledgeBaseId,
    ...(clean(dataSourcesResponse.nextToken)
      ? { nextToken: dataSourcesResponse.nextToken }
      : {}),
  };
}

async function listKnowledgeBaseDocuments(
  client: BedrockAgentMetadataClient,
  {
    dataSourceId,
    domain,
    knowledgeBaseId,
    maxResults,
    nextToken,
  }: KnowledgeBaseDocumentsInput,
): Promise<KnowledgeBaseDocumentsResponse> {
  const response = await client.send(
    new ListKnowledgeBaseDocumentsCommand({
      dataSourceId,
      knowledgeBaseId,
      maxResults,
      ...(nextToken ? { nextToken } : {}),
    }),
  );

  return {
    dataSourceId,
    documents: response.documentDetails?.map(formatDocumentSummary) ?? [],
    domain,
    knowledgeBaseId,
    ...(clean(response.nextToken) ? { nextToken: response.nextToken } : {}),
  };
}

function formatKnowledgeBase(
  response: GetKnowledgeBaseCommandOutput,
): KnowledgeBaseSummary {
  const knowledgeBase = response.knowledgeBase;
  const configuration = knowledgeBase?.knowledgeBaseConfiguration;
  return {
    ...(formatDate(knowledgeBase?.createdAt)
      ? { createdAt: formatDate(knowledgeBase?.createdAt) }
      : {}),
    ...(clean(knowledgeBase?.description)
      ? { description: clean(knowledgeBase?.description) }
      : {}),
    ...(knowledgeBase?.failureReasons?.length
      ? { failureReasons: knowledgeBase.failureReasons }
      : {}),
    ...(clean(knowledgeBase?.knowledgeBaseArn)
      ? { knowledgeBaseArn: clean(knowledgeBase?.knowledgeBaseArn) }
      : {}),
    knowledgeBaseId: knowledgeBase?.knowledgeBaseId ?? "unknown",
    ...(clean(knowledgeBase?.name) ? { name: clean(knowledgeBase?.name) } : {}),
    ...(clean(knowledgeBase?.roleArn)
      ? { roleArn: clean(knowledgeBase?.roleArn) }
      : {}),
    ...(clean(knowledgeBase?.status)
      ? { status: clean(knowledgeBase?.status) }
      : {}),
    ...(knowledgeBase?.storageConfiguration
      ? { storage: knowledgeBase.storageConfiguration }
      : {}),
    ...(clean(configuration?.type) ? { type: clean(configuration?.type) } : {}),
    ...(formatDate(knowledgeBase?.updatedAt)
      ? { updatedAt: formatDate(knowledgeBase?.updatedAt) }
      : {}),
    ...(configuration?.vectorKnowledgeBaseConfiguration
      ? {
          vectorConfiguration: configuration.vectorKnowledgeBaseConfiguration,
        }
      : {}),
    ...(configuration?.sqlKnowledgeBaseConfiguration
      ? { sqlConfiguration: configuration.sqlKnowledgeBaseConfiguration }
      : {}),
  };
}

function formatDataSourceSummary(
  dataSource: NonNullable<
    ListDataSourcesCommandOutput["dataSourceSummaries"]
  >[number],
): KnowledgeBaseDataSourceSummary {
  return {
    dataSourceId: dataSource.dataSourceId ?? "unknown",
    ...(clean(dataSource.description)
      ? { description: clean(dataSource.description) }
      : {}),
    knowledgeBaseId: dataSource.knowledgeBaseId ?? "unknown",
    ...(clean(dataSource.name) ? { name: clean(dataSource.name) } : {}),
    ...(clean(dataSource.status) ? { status: clean(dataSource.status) } : {}),
    ...(formatDate(dataSource.updatedAt)
      ? { updatedAt: formatDate(dataSource.updatedAt) }
      : {}),
  };
}

function formatDocumentSummary(
  document: NonNullable<
    ListKnowledgeBaseDocumentsCommandOutput["documentDetails"]
  >[number],
): KnowledgeBaseDocumentSummary {
  return {
    dataSourceId: document.dataSourceId ?? "unknown",
    identifier: {
      ...(clean(document.identifier?.custom?.id)
        ? { customId: clean(document.identifier?.custom?.id) }
        : {}),
      ...(clean(document.identifier?.dataSourceType)
        ? { dataSourceType: clean(document.identifier?.dataSourceType) }
        : {}),
      ...(clean(document.identifier?.s3?.uri)
        ? { s3Uri: clean(document.identifier?.s3?.uri) }
        : {}),
    },
    knowledgeBaseId: document.knowledgeBaseId ?? "unknown",
    ...(clean(document.status) ? { status: clean(document.status) } : {}),
    ...(clean(document.statusReason)
      ? { statusReason: clean(document.statusReason) }
      : {}),
    ...(formatDate(document.updatedAt)
      ? { updatedAt: formatDate(document.updatedAt) }
      : {}),
  };
}

function formatDate(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function clean(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
