/**
 * Chat UI から使う local BFF dev server。
 *
 * production Lambda と同じ BFF contract を `Bun.serve` で公開し、`POST /api/chat` を
 * local AgentCore Runtime の `/invocations` へ forward する。Vite dev server からの
 * browser request を受けるため、ここでは CORS header も付与する。
 */

import { handleDevInfoRequest } from "../application/handle-dev-info-request.ts";
import { handleExerciseAttemptRequest } from "../application/handle-exercise-attempt-request.ts";
import { handleExerciseCaseRequest } from "../application/handle-exercise-case-request.ts";
import { handleInstructorCommentRequest } from "../application/handle-instructor-comment-request.ts";
import {
  handleKnowledgeBaseDetailRequest,
  type KnowledgeBaseDetailProvider,
} from "../application/handle-knowledge-base-detail-request.ts";
import { handleMaterialCandidateRequest } from "../application/handle-material-candidate-request.ts";
import { handleMaterialRequest } from "../application/handle-material-request.ts";
import { handleProfessionalCommentRequest } from "../application/handle-professional-comment-request.ts";
import { handleQualityMetricsRequest } from "../application/handle-quality-metrics-request.ts";
import { handleReferenceKnowledgeRequest } from "../application/handle-reference-knowledge-request.ts";
import { handleBffRequest } from "../application/handle-request.ts";
import { handleRequiredItemRequest } from "../application/handle-required-item-request.ts";
import { handleRubricRequest } from "../application/handle-rubric-request.ts";
import {
  handleSessionsRequest,
  type ListSessions,
} from "../application/handle-sessions-request.ts";
import { handleSoapDraftRequest } from "../application/handle-soap-draft-request.ts";
import { handleSoapGapsRequest } from "../application/handle-soap-gaps-request.ts";
import { handleSoapMappingRequest } from "../application/handle-soap-mapping-request.ts";
import { handleSoapRecordRequest } from "../application/handle-soap-record-request.ts";
import { handleTrainingDataClusterRequest } from "../application/handle-training-data-cluster-request.ts";
import { handleVoiceRecordingRequest } from "../application/handle-voice-recording-request.ts";
import { handleWsUrlRequest } from "../application/handle-ws-url-request.ts";
import { runtimeInvokeResultFromResponse } from "../application/runtime-response.ts";
import type { KnowledgeBaseIds } from "../contracts/knowledge-base-detail.ts";
import type { RuntimePayload } from "../contracts/runtime.ts";
import { authContextFromJwtClaims } from "../domain/auth.ts";
import { listAgentCoreSessions } from "../infra/agentcore-sessions-client.ts";
import { buildDevInfo } from "../infra/dev-info.ts";
import {
  attachFeedback,
  getAttemptById,
  listAttemptsForTrainee,
  listInstructorQueue,
  markAttemptSubmitted,
  revealFollowup,
  saveDraftAnswers,
  startAttempt,
} from "../infra/exercise-attempt-store.ts";
import {
  createExerciseCase,
  getExerciseCaseById,
  listExerciseCases,
} from "../infra/exercise-case-store.ts";
import { postInstructorComment } from "../infra/exercise-instructor-comment-store.ts";
import { makeKnowledgeBaseDetailProvider } from "../infra/knowledge-base-detail.ts";
import {
  createMaterialCandidateFromComments,
  decideMaterialCandidateStatus,
  listMaterialCandidates,
  promoteMaterialCandidateToMaterial,
} from "../infra/material-candidate-store.ts";
import {
  changeMaterialStatus,
  createMaterial,
  listMaterials,
} from "../infra/material-store.ts";
import {
  createProfessionalComment,
  listCommentsForVersion,
} from "../infra/professional-comment-store.ts";
import { listQualityMetrics } from "../infra/quality-metrics-store.ts";
import { listReferenceKnowledge } from "../infra/reference-knowledge-store.ts";
import {
  createRequiredItem,
  listRequiredItems,
} from "../infra/required-item-store.ts";
import {
  createRubric,
  listRubrics,
  setRubricReviewStatus,
} from "../infra/rubric-store.ts";
import {
  createSoapMappingVersion,
  listSoapMappingVersions,
} from "../infra/soap-mapping-store.ts";
import {
  createSoapRecordVersion,
  listSoapRecords,
  listSoapRecordVersions,
} from "../infra/soap-record-store.ts";
import {
  makeTrainingDataClusterControl,
  type TrainingDataClusterControl,
} from "../infra/training-data-cluster-control.ts";
import {
  getTranscriptionJobStatus,
  saveEditedTranscript,
  uploadRecordingAndStartTranscription,
} from "../infra/voice-capture-store.ts";

const DEFAULT_ACTOR_ID = "web-user";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const DEFAULT_DEV_USER_ID = "local-user";
const DEFAULT_AGENTCORE_RUNTIME_URL = "http://localhost:8080";
const DEFAULT_REGION = "ap-northeast-1";
const AGENTCORE_SESSION_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id";
const AGENTCORE_CUSTOM_ACTOR_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId";
const AGENTCORE_CUSTOM_USER_ID_QUERY =
  "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId";

export type BffDevAuthMode = "dev" | "jwt";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** local BFF dev server の起動設定。 */
export type BffDevConfig = {
  /** AgentCore Runtime に渡す actor_id。local UI では固定利用者として扱う。 */
  actorId: string;
  /** AWS ListSessions で参照する AgentCore Memory ID。未設定なら `/api/sessions` は 503。 */
  agentCoreMemoryId?: string;
  /** local URL issuer の認証 mode。local server は JWT 検証をしない。 */
  authMode: BffDevAuthMode;
  /** dev mode で認証済み user として扱う ID。 */
  devUserId?: string;
  /** Bun.serve が listen する hostname。既定は localhost のみ。 */
  host: string;
  /** Bun.serve が listen する port。 */
  port: number;
  /** AWS SDK client に渡す region。 */
  region: string;
  /** domain 別の Bedrock Knowledge Base ID。 */
  knowledgeBaseIds: KnowledgeBaseIds;
  /** forward 先の AgentCore Runtime base URL。 */
  agentCoreRuntimeUrl: string;
  /**
   * Training Data Store（Aurora Serverless v2、issue #8/#9/#10）の cluster ARN / secret ARN /
   * database 名。3つとも設定済みの場合だけ `/api/soap-records*` が動く（未設定なら 503）。
   */
  trainingDataClusterArn?: string;
  trainingDataDatabaseName?: string;
  trainingDataSecretArn?: string;
  /** Voice Capture の音声原本 / transcript を保存する S3 bucket。未設定なら該当 API は 503。 */
  voiceCaptureBucket?: string;
  /**
   * Amazon Transcribe が StartTranscriptionJob で assume する data access role の ARN。
   * 未設定なら Forward Access Sessions（呼び出し元の権限をそのまま使う既定の仕組み）に任せる。
   */
  voiceCaptureDataAccessRoleArn?: string;
  /** Voice Capture の Amazon Transcribe LanguageCode。 */
  voiceCaptureLanguageCode: string;
};

type BffDevDeps = {
  getKnowledgeBaseDetail?: KnowledgeBaseDetailProvider;
  listSessions?: ListSessions;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  trainingDataClusterControl?: TrainingDataClusterControl;
};

/**
 * local BFF 用の環境変数から起動設定を組み立てる。
 *
 * 空文字・空白のみの値は未設定扱いにし、`BFF_PORT` は正の整数だけ採用する。
 * テストでは任意の env object を渡して `process.env` への依存を避けられる。
 */
export function resolveBffDevConfig(
  env: NodeJS.ProcessEnv = process.env,
): BffDevConfig {
  const authMode = authModeFromEnv(env.BFF_AUTH_MODE);
  const devUserId = clean(env.BFF_DEV_USER_ID) || DEFAULT_DEV_USER_ID;
  const agentCoreMemoryId =
    clean(env.DEV_INFO_AGENTCORE_MEMORY_ID) || clean(env.AGENTCORE_MEMORY_ID);

  return {
    actorId: clean(env.DEFAULT_ACTOR_ID) || DEFAULT_ACTOR_ID,
    ...(agentCoreMemoryId ? { agentCoreMemoryId } : {}),
    authMode,
    ...(authMode === "dev" ? { devUserId } : {}),
    host: clean(env.BFF_HOST) || DEFAULT_HOST,
    knowledgeBaseIds: knowledgeBaseIdsFromEnv(env),
    port: positiveInt(env.BFF_PORT) || DEFAULT_PORT,
    region:
      clean(env.AGENT_RUNTIME_REGION) ||
      clean(env.AWS_REGION) ||
      clean(env.AWS_DEFAULT_REGION) ||
      DEFAULT_REGION,
    agentCoreRuntimeUrl:
      clean(env.AGENTCORE_RUNTIME_URL) || DEFAULT_AGENTCORE_RUNTIME_URL,
    trainingDataClusterArn: clean(env.TRAINING_DATA_CLUSTER_ARN),
    trainingDataDatabaseName: clean(env.TRAINING_DATA_DATABASE_NAME),
    trainingDataSecretArn: clean(env.TRAINING_DATA_SECRET_ARN),
    voiceCaptureBucket: clean(env.VOICE_CAPTURE_BUCKET),
    voiceCaptureDataAccessRoleArn: clean(env.VOICE_CAPTURE_TRANSCRIBE_ROLE_ARN),
    voiceCaptureLanguageCode: clean(env.VOICE_CAPTURE_LANGUAGE_CODE) || "ja-JP",
  };
}

/** Bun 既定の HTTP idleTimeout（10秒）は AgentCore への LLM 生成 forward に足りないため延ばす。 */
const IDLE_TIMEOUT_SECONDS = 60;

/** `BffDevConfig` に従って local BFF dev server を起動する。 */
export function startBffDevServer(config = resolveBffDevConfig()) {
  const server = Bun.serve({
    fetch: (request) => handleBffDevRequest(request, config),
    hostname: config.host,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    port: config.port,
  });

  console.log(
    `[INFO] BFF dev server: http://${server.hostname}:${server.port}/`,
  );
  console.log(
    `[INFO] /api/chat -> ${joinUrl(config.agentCoreRuntimeUrl, "/invocations")}`,
  );

  return server;
}

/**
 * Bun の Request を shared BFF contract に変換して処理する fetch handler。
 *
 * `fetchFn` を差し替えると AgentCore Runtime を起動せずに forward 層を単体テストできる。
 */
export async function handleBffDevRequest(
  request: Request,
  config: BffDevConfig,
  fetchFn: FetchFn = fetch,
  deps: BffDevDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.text();

  if (request.method === "GET" && url.pathname === "/api/dev-info") {
    const bffResponse = await handleDevInfoRequest(
      {
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        getDevInfo: () =>
          buildDevInfo(
            {
              authMode: config.authMode,
              databaseKbId: config.knowledgeBaseIds.database,
              documentKbId: config.knowledgeBaseIds.document,
              lawKbId: config.knowledgeBaseIds.law,
              localRuntimeUrl: config.agentCoreRuntimeUrl,
              medicalCareLawKbId: config.knowledgeBaseIds.medical_care_law,
              memoryId: config.agentCoreMemoryId,
              region: config.region,
              runtimeArn: "",
              runtimeEndpointName: "local",
              runtimeQualifier: "local",
              supportActivityKbId: config.knowledgeBaseIds.support_activity,
            },
            {
              fetchFn,
              requestUrl: request.url,
            },
          ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/api/knowledge-bases/")
  ) {
    const bffResponse = await handleKnowledgeBaseDetailRequest(
      {
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        getKnowledgeBaseDetail:
          deps.getKnowledgeBaseDetail ??
          makeKnowledgeBaseDetailProvider({ region: config.region }),
        knowledgeBaseIds: config.knowledgeBaseIds,
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    const bffResponse = await handleSessionsRequest(
      {
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        listSessions:
          deps.listSessions ??
          (({ actorId }) =>
            listAgentCoreSessions(
              {
                memoryId: config.agentCoreMemoryId || "",
                region: config.region,
              },
              { actorId },
            )),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
        memoryId: config.agentCoreMemoryId,
      },
    );

    return responseFromBff(bffResponse);
  }

  if (request.method === "POST" && url.pathname === "/api/ws-url") {
    const bffResponse = await handleWsUrlRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        createWebSocketUrl: async ({ actorId, runtimeSessionId, userId }) =>
          localWebSocketUrl(config.agentCoreRuntimeUrl, {
            actorId,
            runtimeSessionId,
            userId,
          }),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/soap-draft") {
    const bffResponse = await handleSoapDraftRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        actorId: config.actorId,
        invokeRuntime: (_runtimeSessionId, payload) =>
          invokeLocalRuntime(config, payload, fetchFn),
        logError: (message, detail) => console.error(message, detail),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/exercise-cases" ||
    url.pathname.startsWith("/api/exercise-cases/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleExerciseCaseRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createCase: (input) => createExerciseCase(storeConfig, input),
        getCaseById: (id) => getExerciseCaseById(storeConfig, id),
        listCases: (filters) => listExerciseCases(storeConfig, filters),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/exercise-attempts" ||
    url.pathname.startsWith("/api/exercise-attempts/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleExerciseAttemptRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        attachFeedback: (input) => attachFeedback(storeConfig, input),
        authContext: authContextForConfig(config),
        getAttemptById: (id) => getAttemptById(storeConfig, id),
        invokeRuntime: (_runtimeSessionId, payload) =>
          invokeLocalRuntime(config, payload, fetchFn),
        listAttemptsForTrainee: (traineeId) =>
          listAttemptsForTrainee(storeConfig, traineeId),
        listInstructorQueue: () => listInstructorQueue(storeConfig),
        logError: (message, detail) => console.error(message, detail),
        markAttemptSubmitted: (input) =>
          markAttemptSubmitted(storeConfig, input),
        revealFollowup: (input) => revealFollowup(storeConfig, input),
        saveDraftAnswers: (input) => saveDraftAnswers(storeConfig, input),
        startAttempt: (input) => startAttempt(storeConfig, input),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/instructor-comments") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleInstructorCommentRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        logError: (message, detail) => console.error(message, detail),
        postComment: (input) => postInstructorComment(storeConfig, input),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/soap-gaps") {
    const bffResponse = await handleSoapGapsRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        actorId: config.actorId,
        invokeRuntime: (_runtimeSessionId, payload) =>
          invokeLocalRuntime(config, payload, fetchFn),
        logError: (message, detail) => console.error(message, detail),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/soap-records" ||
    url.pathname.startsWith("/api/soap-records/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleSoapRecordRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        createRecordVersion: (input) =>
          createSoapRecordVersion(storeConfig, input),
        listRecords: () => listSoapRecords(storeConfig),
        listVersions: (input) => listSoapRecordVersions(storeConfig, input),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/professional-comments") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleProfessionalCommentRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createComment: (input) => createProfessionalComment(storeConfig, input),
        listCommentsForVersion: (input) =>
          listCommentsForVersion(storeConfig, input),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/material-candidates" ||
    url.pathname.startsWith("/api/material-candidates/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleMaterialCandidateRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createCandidate: (input) =>
          createMaterialCandidateFromComments(storeConfig, input),
        decideStatus: (input) =>
          decideMaterialCandidateStatus(storeConfig, input),
        listCandidates: (filters) =>
          listMaterialCandidates(storeConfig, filters),
        logError: (message, detail) => console.error(message, detail),
        promoteToMaterial: (input) =>
          promoteMaterialCandidateToMaterial(storeConfig, input),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/training-data-cluster" ||
    url.pathname === "/api/training-data-cluster/start"
  ) {
    const clusterConfig = { clusterArn: config.trainingDataClusterArn ?? "" };
    const control =
      deps.trainingDataClusterControl ??
      makeTrainingDataClusterControl({ region: config.region });

    const bffResponse = await handleTrainingDataClusterRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        getClusterStatus: () => control.getStatus(clusterConfig),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
        startCluster: () => control.start(clusterConfig),
        trainingDataConfigured: Boolean(config.trainingDataClusterArn),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/materials" ||
    url.pathname.startsWith("/api/materials/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleMaterialRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        changeStatus: (input) => changeMaterialStatus(storeConfig, input),
        createMaterial: (input) => createMaterial(storeConfig, input),
        listMaterials: (filters) => listMaterials(storeConfig, filters),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/rubrics" ||
    url.pathname.startsWith("/api/rubrics/")
  ) {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleRubricRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createRubric: (input) => createRubric(storeConfig, input),
        listRubrics: () => listRubrics(storeConfig),
        logError: (message, detail) => console.error(message, detail),
        setReviewStatus: (input) => setRubricReviewStatus(storeConfig, input),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/reference-knowledge") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleReferenceKnowledgeRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        listReferenceKnowledge: () => listReferenceKnowledge(storeConfig),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/soap-mapping-versions") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleSoapMappingRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createVersion: (input) => createSoapMappingVersion(storeConfig, input),
        listVersions: (input) => listSoapMappingVersions(storeConfig, input),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/required-items") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleRequiredItemRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
        query: queryFromUrl(url),
      },
      {
        authContext: authContextForConfig(config),
        createItem: (input) => createRequiredItem(storeConfig, input),
        listItems: (filters) => listRequiredItems(storeConfig, filters),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (url.pathname === "/api/quality-metrics") {
    const storeConfig = {
      clusterArn: config.trainingDataClusterArn ?? "",
      database: config.trainingDataDatabaseName ?? "",
      region: config.region,
      secretArn: config.trainingDataSecretArn ?? "",
    };

    const bffResponse = await handleQualityMetricsRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        authContext: authContextForConfig(config),
        listMetrics: () => listQualityMetrics(storeConfig),
        logError: (message, detail) => console.error(message, detail),
        trainingDataConfigured: Boolean(
          config.trainingDataClusterArn &&
            config.trainingDataDatabaseName &&
            config.trainingDataSecretArn,
        ),
      },
    );

    return responseFromBff(bffResponse);
  }

  if (
    url.pathname === "/api/voice-recordings" ||
    url.pathname.startsWith("/api/voice-recordings/")
  ) {
    const storeConfig = {
      bucket: config.voiceCaptureBucket ?? "",
      dataAccessRoleArn: config.voiceCaptureDataAccessRoleArn,
      languageCode: config.voiceCaptureLanguageCode,
      region: config.region,
    };

    const bffResponse = await handleVoiceRecordingRequest(
      {
        body,
        method: request.method,
        path: url.pathname,
      },
      {
        createRecording: (input) =>
          uploadRecordingAndStartTranscription(storeConfig, input),
        getRecordingStatus: (input) =>
          getTranscriptionJobStatus(storeConfig, input),
        logError: (message, detail) => console.error(message, detail),
        saveEditedTranscript: (input) =>
          saveEditedTranscript(storeConfig, input),
        voiceCaptureBucket: config.voiceCaptureBucket,
      },
    );

    return responseFromBff(bffResponse);
  }

  const bffResponse = await handleBffRequest(
    {
      body,
      method: request.method,
      path: url.pathname,
    },
    {
      actorId: config.actorId,
      invokeRuntime: (_runtimeSessionId, payload) =>
        invokeLocalRuntime(config, payload, fetchFn),
      logError: (message, detail) => console.error(message, detail),
    },
  );

  return responseFromBff(bffResponse);
}

function responseFromBff(bffResponse: {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
}): Response {
  return new Response(
    bffResponse.statusCode === 204 ? null : bffResponse.body,
    {
      headers: {
        ...corsHeaders(),
        ...bffResponse.headers,
      },
      status: bffResponse.statusCode,
    },
  );
}

/** shared BFF が組み立てた RuntimePayload を local Runtime の `/invocations` に送る。 */
async function invokeLocalRuntime(
  config: BffDevConfig,
  payload: RuntimePayload,
  fetchFn: FetchFn,
) {
  const upstream = await fetchFn(
    joinUrl(config.agentCoreRuntimeUrl, "/invocations"),
    {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  return runtimeInvokeResultFromResponse(upstream);
}

/** browser の local dev request を許可する CORS header。 */
function corsHeaders() {
  return {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-origin": "*",
  };
}

/** trim 後に非空の文字列だけを返す（空文字・空白のみは未設定扱い）。 */
function clean(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function authModeFromEnv(value: string | undefined): BffDevAuthMode {
  const mode = clean(value) || "dev";
  if (mode === "dev" || mode === "jwt") {
    return mode;
  }
  throw new Error("BFF_AUTH_MODE must be jwt or dev");
}

function authContextForConfig(config: BffDevConfig) {
  return config.authMode === "dev" && config.devUserId
    ? authContextFromJwtClaims({ sub: config.devUserId })
    : undefined;
}

function knowledgeBaseIdsFromEnv(env: NodeJS.ProcessEnv): KnowledgeBaseIds {
  return {
    database: clean(env.DEV_INFO_DATABASE_KB_ID) || clean(env.DATABASE_KB_ID),
    document: clean(env.DEV_INFO_DOCUMENT_KB_ID) || clean(env.DOCUMENT_KB_ID),
    law: clean(env.DEV_INFO_LAW_KB_ID) || clean(env.LAW_KB_ID),
    medical_care_law:
      clean(env.DEV_INFO_MEDICAL_CARE_LAW_KB_ID) ||
      clean(env.MEDICAL_CARE_LAW_KB_ID),
    support_activity:
      clean(env.DEV_INFO_SUPPORT_ACTIVITY_KB_ID) ||
      clean(env.SUPPORT_ACTIVITY_KB_ID),
  };
}

function queryFromUrl(url: URL): Record<string, string | undefined> {
  return Object.fromEntries(url.searchParams.entries());
}

/** base URL 末尾の slash を 1 つにそろえて path を連結する。 */
function joinUrl(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function localWebSocketUrl(
  baseUrl: string,
  context: {
    actorId: string;
    runtimeSessionId: string;
    userId: string;
  },
): string {
  const url = new URL(joinUrl(baseUrl, "/ws"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set(AGENTCORE_SESSION_ID_QUERY, context.runtimeSessionId);
  url.searchParams.set(AGENTCORE_CUSTOM_ACTOR_ID_QUERY, context.actorId);
  url.searchParams.set(AGENTCORE_CUSTOM_USER_ID_QUERY, context.userId);
  return url.toString();
}

/** 正の整数として解釈できる値だけを返す。 */
function positiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

if (import.meta.main) {
  startBffDevServer();
}
