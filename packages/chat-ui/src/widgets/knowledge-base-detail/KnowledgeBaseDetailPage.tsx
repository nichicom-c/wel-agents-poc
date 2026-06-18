import { useEffect, useState } from "react";

import {
  isKnowledgeBaseNotConfiguredError,
  type KnowledgeBaseDataSourceSummary,
  type KnowledgeBaseDocumentSummary,
  type KnowledgeBaseDomain,
  type KnowledgeBaseOverview,
  requestKnowledgeBaseDocuments,
  requestKnowledgeBaseOverview,
} from "../../features/knowledge-base-detail/index.ts";
import { Icon } from "../../shared/ui/Icon.tsx";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RequestStatus = "error" | "idle" | "loading" | "ready";

type DocumentsState = {
  documents: KnowledgeBaseDocumentSummary[];
  error: string;
  nextToken?: string;
  status: RequestStatus;
};

type KnowledgeBaseDetailPageProps = {
  accessToken: string;
  domain: KnowledgeBaseDomain;
  fetchFn?: FetchFn;
  isEnvironmentPanelOpen: boolean;
  isSessionPanelOpen: boolean;
  onBack: () => void;
  onOpenEnvironmentPanel: () => void;
  onOpenSessionPanel: () => void;
};

const DOCUMENTS_PAGE_SIZE = 100;

const DOMAIN_LABELS: Record<KnowledgeBaseDomain, string> = {
  database: "KB database",
  document: "KB document",
  law: "KB law",
  medical_care_law: "KB medical",
  support_activity: "KB support",
};

export function KnowledgeBaseDetailPage({
  accessToken,
  domain,
  fetchFn,
  isEnvironmentPanelOpen,
  isSessionPanelOpen,
  onBack,
  onOpenEnvironmentPanel,
  onOpenSessionPanel,
}: KnowledgeBaseDetailPageProps) {
  const [overview, setOverview] = useState<KnowledgeBaseOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewReloadKey, setOverviewReloadKey] = useState(0);
  const [overviewStatus, setOverviewStatus] = useState<RequestStatus>("idle");
  const [selectedDataSourceId, setSelectedDataSourceId] = useState("");
  const [documentsReloadKey, setDocumentsReloadKey] = useState(0);
  const [documentsState, setDocumentsState] = useState<DocumentsState>({
    documents: [],
    error: "",
    status: "idle",
  });
  const [isLoadingMoreDocuments, setIsLoadingMoreDocuments] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: overviewReloadKey intentionally triggers manual refresh.
  useEffect(() => {
    let cancelled = false;

    setOverview(null);
    setOverviewError("");
    setOverviewStatus("loading");
    setSelectedDataSourceId("");
    setDocumentsState({ documents: [], error: "", status: "idle" });

    requestKnowledgeBaseOverview({ accessToken, domain, fetchFn })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOverview(result);
        setSelectedDataSourceId(result.dataSources[0]?.dataSourceId ?? "");
        setOverviewStatus("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setOverviewError(errorMessage(error));
        setOverviewStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, domain, fetchFn, overviewReloadKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: documentsReloadKey intentionally triggers manual refresh.
  useEffect(() => {
    if (!selectedDataSourceId) {
      setDocumentsState({ documents: [], error: "", status: "idle" });
      return;
    }

    let cancelled = false;
    setDocumentsState({ documents: [], error: "", status: "loading" });

    requestKnowledgeBaseDocuments({
      accessToken,
      dataSourceId: selectedDataSourceId,
      domain,
      fetchFn,
      maxResults: DOCUMENTS_PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDocumentsState({
          documents: result.documents,
          error: "",
          nextToken: result.nextToken,
          status: "ready",
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setDocumentsState({
          documents: [],
          error: errorMessage(error),
          status: "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, domain, documentsReloadKey, fetchFn, selectedDataSourceId]);

  const selectedDataSource = overview?.dataSources.find(
    (dataSource) => dataSource.dataSourceId === selectedDataSourceId,
  );
  const isOverviewLoading = overviewStatus === "loading";
  const isDocumentsLoading = documentsState.status === "loading";

  const refresh = () => {
    setOverviewReloadKey((value) => value + 1);
    setDocumentsReloadKey((value) => value + 1);
  };

  const loadMoreDocuments = async () => {
    if (!selectedDataSourceId || !documentsState.nextToken) {
      return;
    }

    setIsLoadingMoreDocuments(true);
    try {
      const result = await requestKnowledgeBaseDocuments({
        accessToken,
        dataSourceId: selectedDataSourceId,
        domain,
        fetchFn,
        maxResults: DOCUMENTS_PAGE_SIZE,
        nextToken: documentsState.nextToken,
      });
      setDocumentsState((current) => ({
        documents: [...current.documents, ...result.documents],
        error: "",
        nextToken: result.nextToken,
        status: "ready",
      }));
    } catch (error) {
      setDocumentsState((current) => ({
        ...current,
        error: errorMessage(error),
        status: "error",
      }));
    } finally {
      setIsLoadingMoreDocuments(false);
    }
  };

  return (
    <section className="kb-detail-page" aria-label="Knowledge Base 詳細">
      <header className="topbar kb-detail-topbar">
        <div className="mobile-panel-actions topbar-history-action">
          <button
            className="topbar-icon-button"
            type="button"
            aria-controls="session-panel"
            aria-expanded={isSessionPanelOpen}
            aria-label="会話履歴を開く"
            title="会話履歴を開く"
            onClick={onOpenSessionPanel}
          >
            <Icon name="menu" />
          </button>
        </div>
        <button
          className="topbar-icon-button"
          type="button"
          aria-label="チャットに戻る"
          title="チャットに戻る"
          onClick={onBack}
        >
          <Icon name="arrow_back" />
        </button>
        <div className="topbar-title kb-detail-title">
          <p className="eyebrow">Knowledge Base</p>
          <h1>{DOMAIN_LABELS[domain]}</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="secondary-button kb-detail-refresh-button"
            type="button"
            disabled={isOverviewLoading || isDocumentsLoading}
            onClick={refresh}
          >
            <Icon name="refresh" size={17} />
            <span>{isOverviewLoading ? "更新中" : "更新"}</span>
          </button>
          <div className="mobile-panel-actions topbar-actions">
            <button
              className="topbar-icon-button"
              type="button"
              aria-controls="environment-panel"
              aria-expanded={isEnvironmentPanelOpen}
              aria-label="環境情報を開く"
              title="環境情報を開く"
              onClick={onOpenEnvironmentPanel}
            >
              <Icon name="info" />
            </button>
          </div>
        </div>
      </header>

      <div className="kb-detail-scroll">
        {overviewError ? (
          <p className="kb-detail-error" role="alert">
            {overviewError}
          </p>
        ) : null}

        <section className="kb-detail-section">
          <div className="kb-detail-section-heading">
            <h2>概要</h2>
            <span className="kb-detail-status">
              {statusLabel(overviewStatus)}
            </span>
          </div>
          <DetailRows
            rows={[
              ["Domain", domain],
              ["KB ID", overview?.knowledgeBaseId ?? "未取得", true],
              ["Name", overview?.knowledgeBase.name ?? "未取得"],
              ["Status", overview?.knowledgeBase.status ?? "未取得"],
              ["Type", overview?.knowledgeBase.type ?? "未取得"],
              ["Updated", overview?.knowledgeBase.updatedAt ?? "未取得"],
              [
                "ARN",
                overview?.knowledgeBase.knowledgeBaseArn ?? "未取得",
                true,
              ],
            ]}
          />
        </section>

        <section className="kb-detail-section">
          <div className="kb-detail-section-heading">
            <h2>Data Sources</h2>
            <span className="kb-detail-count">
              {overview?.dataSources.length ?? 0}
            </span>
          </div>
          <DataSourceList
            dataSources={overview?.dataSources ?? []}
            selectedDataSourceId={selectedDataSourceId}
            onSelect={setSelectedDataSourceId}
          />
        </section>

        <section className="kb-detail-section">
          <div className="kb-detail-section-heading">
            <h2>Documents</h2>
            <span className="kb-detail-status">
              {statusLabel(documentsState.status)}
            </span>
          </div>
          {selectedDataSource ? (
            <DetailRows
              rows={[
                ["Data Source", selectedDataSource.name ?? "未取得"],
                ["Data Source ID", selectedDataSource.dataSourceId, true],
                ["Status", selectedDataSource.status ?? "未取得"],
                ["Updated", selectedDataSource.updatedAt ?? "未取得"],
              ]}
            />
          ) : null}
          {documentsState.error ? (
            <p className="kb-detail-error" role="alert">
              {documentsState.error}
            </p>
          ) : null}
          <DocumentList documents={documentsState.documents} />
          {documentsState.nextToken ? (
            <button
              className="secondary-button kb-detail-load-more"
              type="button"
              disabled={isLoadingMoreDocuments}
              onClick={() => void loadMoreDocuments()}
            >
              <Icon name="more_horiz" size={17} />
              <span>{isLoadingMoreDocuments ? "取得中" : "続き"}</span>
            </button>
          ) : null}
        </section>

        <section className="kb-detail-section">
          <div className="kb-detail-section-heading">
            <h2>Configuration</h2>
          </div>
          <ConfigBlock
            label="Storage"
            value={overview?.knowledgeBase.storage}
          />
          <ConfigBlock
            label="Vector"
            value={overview?.knowledgeBase.vectorConfiguration}
          />
          <ConfigBlock
            label="SQL"
            value={overview?.knowledgeBase.sqlConfiguration}
          />
        </section>
      </div>
    </section>
  );
}

function DataSourceList({
  dataSources,
  onSelect,
  selectedDataSourceId,
}: {
  dataSources: KnowledgeBaseDataSourceSummary[];
  onSelect: (dataSourceId: string) => void;
  selectedDataSourceId: string;
}) {
  if (dataSources.length === 0) {
    return <p className="kb-detail-empty">Data Source はありません</p>;
  }

  return (
    <div className="kb-data-source-list">
      {dataSources.map((dataSource) => (
        <button
          className="kb-data-source-button"
          type="button"
          data-selected={
            dataSource.dataSourceId === selectedDataSourceId ? "true" : "false"
          }
          key={dataSource.dataSourceId}
          onClick={() => onSelect(dataSource.dataSourceId)}
        >
          <span>{dataSource.name ?? dataSource.dataSourceId}</span>
          <code>{dataSource.dataSourceId}</code>
          <Icon name="chevron_right" size={17} />
        </button>
      ))}
    </div>
  );
}

function DetailRows({
  rows,
}: {
  rows: Array<[label: string, value: string, isCode?: boolean]>;
}) {
  return (
    <dl className="kb-detail-metadata">
      {rows.map(([label, value, isCode]) => (
        <div className="kb-detail-metadata-row" key={label}>
          <dt>{label}</dt>
          <dd className={isCode ? "kb-detail-code" : undefined}>
            {valueOrPlaceholder(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentList({
  documents,
}: {
  documents: KnowledgeBaseDocumentSummary[];
}) {
  if (documents.length === 0) {
    return <p className="kb-detail-empty">Document はありません</p>;
  }

  return (
    <div className="kb-documents-list">
      {documents.map((document, index) => (
        <article
          className="kb-document-row"
          key={`${document.dataSourceId}-${document.identifier.s3Uri ?? document.identifier.customId ?? index}`}
        >
          <header>
            <span className="kb-detail-pill">
              {document.status ?? "unknown"}
            </span>
            <span>{document.identifier.dataSourceType ?? "unknown"}</span>
            <span>{document.updatedAt ?? "unknown"}</span>
          </header>
          <p className="kb-detail-code">
            {document.identifier.s3Uri ??
              document.identifier.customId ??
              "identifier unavailable"}
          </p>
          {document.statusReason ? (
            <p className="kb-document-reason">{document.statusReason}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ConfigBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) {
    return (
      <div className="kb-config-block">
        <span>{label}</span>
        <p>未取得</p>
      </div>
    );
  }

  return (
    <div className="kb-config-block">
      <span>{label}</span>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function statusLabel(status: RequestStatus): string {
  switch (status) {
    case "error":
      return "エラー";
    case "idle":
      return "待機中";
    case "loading":
      return "取得中";
    case "ready":
      return "取得済み";
  }
}

function errorMessage(error: unknown): string {
  if (isKnowledgeBaseNotConfiguredError(error)) {
    return "Knowledge Base is not configured";
  }

  return error instanceof Error ? error.message : String(error);
}

function valueOrPlaceholder(value: string): string {
  const trimmed = value.trim();
  return trimmed || "未取得";
}
