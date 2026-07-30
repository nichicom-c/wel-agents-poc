/**
 * production BFF Lambda adapter。
 *
 * API Gateway event を shared BFF contract に変換し、`POST /api/chat` を Amazon Bedrock
 * AgentCore Runtime へ forward する。BFF の routing / validation / response shaping は
 * `handleBffRequest` に集約し、この file は Lambda event の適合だけを担う。
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
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
import { handleVoiceRecordingRequest } from "../application/handle-voice-recording-request.ts";
import {
  type CreateWebSocketUrl,
  handleWsUrlRequest,
} from "../application/handle-ws-url-request.ts";
import type { KnowledgeBaseIds } from "../contracts/knowledge-base-detail.ts";
import { authContextFromJwtClaims } from "../domain/auth.ts";
import {
  type AgentCoreRuntimeClientDeps,
  invokeAgentCoreRuntime,
} from "../infra/agentcore-runtime-client.ts";
import { listAgentCoreSessions } from "../infra/agentcore-sessions-client.ts";
import {
  type AgentCoreWebSocketPresignerDeps,
  createAgentCoreWebSocketUrl,
} from "../infra/agentcore-websocket-presigner.ts";
import {
  buildDevInfo,
  type CallerIdentity,
  type DevInfoConfig,
} from "../infra/dev-info.ts";
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
  getExerciseCaseById,
  listExerciseCases,
} from "../infra/exercise-case-store.ts";
import { postInstructorComment } from "../infra/exercise-instructor-comment-store.ts";
import { makeKnowledgeBaseDetailProvider } from "../infra/knowledge-base-detail.ts";
import {
  configFromEnv,
  type EnvSource,
  type LambdaConfig,
} from "../infra/lambda-config.ts";
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
  getTranscriptionJobStatus,
  saveEditedTranscript,
  uploadRecordingAndStartTranscription,
} from "../infra/voice-capture-store.ts";

export { configFromEnv } from "../infra/lambda-config.ts";

type LambdaHandlerDeps = AgentCoreRuntimeClientDeps & {
  createWebSocketUrl?: CreateWebSocketUrl;
  getCallerIdentity?: () => Promise<CallerIdentity>;
  getKnowledgeBaseDetail?: KnowledgeBaseDetailProvider;
  listSessions?: ListSessions;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  webSocketPresignerDeps?: AgentCoreWebSocketPresignerDeps;
};

/** API Gateway REST API / HTTP API の両方から必要項目だけを受け取る event shape。 */
type LambdaEvent = {
  /** request body。REST API / HTTP API どちらでも string または null で届く。 */
  body?: string | null;
  /** REST API / HTTP API event の request headers。 */
  headers?: Record<string, string | undefined>;
  /** REST API event の method。 */
  httpMethod?: string;
  /** body が base64 encoded かどうか。 */
  isBase64Encoded?: boolean;
  /** REST API event の path。 */
  path?: string;
  /** REST API / HTTP API event の query string。 */
  queryStringParameters?: Record<string, string | undefined> | null;
  /** HTTP API event の raw path。 */
  rawPath?: string;
  /** HTTP API event の request context。 */
  requestContext?: {
    /** HTTP API JWT authorizer が検証した claims。 */
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
    http?: {
      /** HTTP API event の method。 */
      method?: string;
    };
  };
};

/** AWS Lambda runtime から呼ばれる entrypoint。 */
export async function handler(event: LambdaEvent) {
  return handleLambdaEvent(event);
}

/**
 * API Gateway event を BFF core request に変換して処理する。
 *
 * `runtimeClientDeps` を差し替えると AgentCore Runtime を呼ばずに Lambda adapter 層を
 * 単体テストできる。
 */
export async function handleLambdaEvent(
  event: LambdaEvent,
  env: EnvSource = process.env,
  deps: LambdaHandlerDeps = {},
) {
  const config = configFromEnv(env);
  const method = event.requestContext?.http?.method || event.httpMethod || "";
  const path = event.rawPath || event.path || "/";

  if (method === "GET" && path === "/api/dev-info") {
    return handleDevInfoRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      {
        authContext: authContextForEvent(event, config),
        getDevInfo: () =>
          buildDevInfo(devInfoConfigForLambda(config), {
            getCallerIdentity:
              deps.getCallerIdentity ??
              (() => getCallerIdentity(config.region)),
            headers: event.headers,
          }),
      },
    );
  }

  if (method === "GET" && path.startsWith("/api/knowledge-bases/")) {
    return handleKnowledgeBaseDetailRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      {
        authContext: authContextForEvent(event, config),
        getKnowledgeBaseDetail:
          deps.getKnowledgeBaseDetail ??
          makeKnowledgeBaseDetailProvider({ region: config.region }),
        knowledgeBaseIds: knowledgeBaseIdsFromDevInfo(
          devInfoConfigForLambda(config),
        ),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
      },
    );
  }

  if (method === "GET" && path === "/api/sessions") {
    const memoryId = config.devInfo?.memoryId;
    return handleSessionsRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      {
        authContext: authContextForEvent(event, config),
        listSessions:
          deps.listSessions ??
          (({ actorId }) =>
            listAgentCoreSessions(
              {
                memoryId: memoryId || "",
                region: config.region,
              },
              { actorId },
            )),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
        memoryId,
      },
    );
  }

  if (method === "POST" && path === "/api/ws-url") {
    return handleWsUrlRequest(
      {
        body: event.body,
        headers: event.headers,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      {
        createWebSocketUrl:
          deps.createWebSocketUrl ??
          (({ actorId, expiresIn, qualifier, runtimeSessionId, userId }) =>
            createAgentCoreWebSocketUrl(
              {
                actorId,
                expiresIn,
                qualifier,
                region: config.region,
                runtimeArn: config.runtimeArn,
                sessionId: runtimeSessionId,
                userId,
              },
              deps.webSocketPresignerDeps,
            )),
        authContext: authContextForEvent(event, config),
        expiresIn: config.wsUrlExpiresSeconds,
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
        qualifier: config.qualifier,
      },
    );
  }

  if (
    path === "/api/exercise-cases" ||
    path.startsWith("/api/exercise-cases/")
  ) {
    return handleExerciseCaseRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      exerciseCaseOptions(config, event, deps),
    );
  }

  if (
    path === "/api/exercise-attempts" ||
    path.startsWith("/api/exercise-attempts/")
  ) {
    return handleExerciseAttemptRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      exerciseAttemptOptions(config, event, deps),
    );
  }

  if (path === "/api/instructor-comments") {
    return handleInstructorCommentRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      instructorCommentOptions(config, event, deps),
    );
  }

  if (path === "/api/soap-draft") {
    return handleSoapDraftRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      {
        actorId: config.actorId,
        invokeRuntime: (runtimeSessionId, payload) =>
          invokeAgentCoreRuntime(config, runtimeSessionId, payload, deps),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
      },
    );
  }

  if (path === "/api/soap-gaps") {
    return handleSoapGapsRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      {
        actorId: config.actorId,
        invokeRuntime: (runtimeSessionId, payload) =>
          invokeAgentCoreRuntime(config, runtimeSessionId, payload, deps),
        logError:
          deps.logError ??
          ((message, detail) => console.error(message, detail)),
      },
    );
  }

  if (path === "/api/soap-records" || path.startsWith("/api/soap-records/")) {
    return handleSoapRecordRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      soapRecordOptions(config, event, deps),
    );
  }

  if (path === "/api/professional-comments") {
    return handleProfessionalCommentRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      professionalCommentOptions(config, event, deps),
    );
  }

  if (
    path === "/api/material-candidates" ||
    path.startsWith("/api/material-candidates/")
  ) {
    return handleMaterialCandidateRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      materialCandidateOptions(config, event, deps),
    );
  }

  if (path === "/api/materials" || path.startsWith("/api/materials/")) {
    return handleMaterialRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      materialOptions(config, event, deps),
    );
  }

  if (path === "/api/rubrics" || path.startsWith("/api/rubrics/")) {
    return handleRubricRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      rubricOptions(config, event, deps),
    );
  }

  if (path === "/api/reference-knowledge") {
    return handleReferenceKnowledgeRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      referenceKnowledgeOptions(config, event, deps),
    );
  }

  if (path === "/api/soap-mapping-versions") {
    return handleSoapMappingRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      soapMappingOptions(config, event, deps),
    );
  }

  if (path === "/api/required-items") {
    return handleRequiredItemRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
        query: event.queryStringParameters ?? undefined,
      },
      requiredItemOptions(config, event, deps),
    );
  }

  if (path === "/api/quality-metrics") {
    return handleQualityMetricsRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      qualityMetricsOptions(config, event, deps),
    );
  }

  if (
    path === "/api/voice-recordings" ||
    path.startsWith("/api/voice-recordings/")
  ) {
    return handleVoiceRecordingRequest(
      {
        body: event.body,
        isBase64Encoded: event.isBase64Encoded,
        method,
        path,
      },
      voiceRecordingOptions(config, deps),
    );
  }

  return handleBffRequest(
    {
      body: event.body,
      isBase64Encoded: event.isBase64Encoded,
      method,
      path,
    },
    {
      actorId: config.actorId,
      invokeRuntime: (runtimeSessionId, payload) =>
        invokeAgentCoreRuntime(config, runtimeSessionId, payload, deps),
      logError:
        deps.logError ?? ((message, detail) => console.error(message, detail)),
    },
  );
}

async function getCallerIdentity(region: string): Promise<CallerIdentity> {
  const client = new STSClient({ region });
  const identity = await client.send(new GetCallerIdentityCommand({}));
  return { accountId: identity.Account };
}

/** Voice Capture handler が使う options を組み立てる。bucket 未設定時は handler 側が 503 を返す。 */
function voiceRecordingOptions(
  config: LambdaConfig,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleVoiceRecordingRequest>[1] {
  const storeConfig = {
    bucket: config.voiceCaptureBucket ?? "",
    dataAccessRoleArn: config.voiceCaptureDataAccessRoleArn,
    languageCode: config.voiceCaptureLanguageCode,
    region: config.region,
  };

  return {
    createRecording: (input) =>
      uploadRecordingAndStartTranscription(storeConfig, input),
    getRecordingStatus: (input) =>
      getTranscriptionJobStatus(storeConfig, input),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    saveEditedTranscript: (input) => saveEditedTranscript(storeConfig, input),
    voiceCaptureBucket: config.voiceCaptureBucket,
  };
}

/** SOAP 正式記録 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function soapRecordOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleSoapRecordRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createRecordVersion: (input) => createSoapRecordVersion(storeConfig, input),
    listRecords: () => listSoapRecords(storeConfig),
    listVersions: (input) => listSoapRecordVersions(storeConfig, input),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 専門職コメント handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function professionalCommentOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleProfessionalCommentRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createComment: (input) => createProfessionalComment(storeConfig, input),
    listCommentsForVersion: (input) =>
      listCommentsForVersion(storeConfig, input),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 教材候補 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function materialCandidateOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleMaterialCandidateRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createCandidate: (input) =>
      createMaterialCandidateFromComments(storeConfig, input),
    decideStatus: (input) => decideMaterialCandidateStatus(storeConfig, input),
    listCandidates: (filters) => listMaterialCandidates(storeConfig, filters),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    promoteToMaterial: (input) =>
      promoteMaterialCandidateToMaterial(storeConfig, input),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 教材 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function materialOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleMaterialRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    changeStatus: (input) => changeMaterialStatus(storeConfig, input),
    createMaterial: (input) => createMaterial(storeConfig, input),
    listMaterials: (filters) => listMaterials(storeConfig, filters),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** ルーブリック handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function rubricOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleRubricRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createRubric: (input) => createRubric(storeConfig, input),
    listRubrics: () => listRubrics(storeConfig),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    setReviewStatus: (input) => setRubricReviewStatus(storeConfig, input),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 参照知識 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function referenceKnowledgeOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleReferenceKnowledgeRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    listReferenceKnowledge: () => listReferenceKnowledge(storeConfig),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** SOAP マッピング handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function soapMappingOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleSoapMappingRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createVersion: (input) => createSoapMappingVersion(storeConfig, input),
    listVersions: (input) => listSoapMappingVersions(storeConfig, input),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 必須・推奨項目 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function requiredItemOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleRequiredItemRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    createItem: (input) => createRequiredItem(storeConfig, input),
    listItems: (filters) => listRequiredItems(storeConfig, filters),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 品質指標 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function qualityMetricsOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleQualityMetricsRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    listMetrics: () => listQualityMetrics(storeConfig),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 演習ケース handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function exerciseCaseOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleExerciseCaseRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    getCaseById: (id) => getExerciseCaseById(storeConfig, id),
    listCases: (filters) => listExerciseCases(storeConfig, filters),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 演習の受講記録 handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function exerciseAttemptOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleExerciseAttemptRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    attachFeedback: (input) => attachFeedback(storeConfig, input),
    authContext: authContextForEvent(event, config),
    getAttemptById: (id) => getAttemptById(storeConfig, id),
    invokeRuntime: (runtimeSessionId, payload) =>
      invokeAgentCoreRuntime(config, runtimeSessionId, payload, deps),
    listAttemptsForTrainee: (traineeId) =>
      listAttemptsForTrainee(storeConfig, traineeId),
    listInstructorQueue: () => listInstructorQueue(storeConfig),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    markAttemptSubmitted: (input) => markAttemptSubmitted(storeConfig, input),
    revealFollowup: (input) => revealFollowup(storeConfig, input),
    saveDraftAnswers: (input) => saveDraftAnswers(storeConfig, input),
    startAttempt: (input) => startAttempt(storeConfig, input),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

/** 指導者コメント handler が使う options を組み立てる。3つとも未設定なら handler 側が 503 を返す。 */
function instructorCommentOptions(
  config: LambdaConfig,
  event: LambdaEvent,
  deps: LambdaHandlerDeps,
): Parameters<typeof handleInstructorCommentRequest>[1] {
  const storeConfig = {
    clusterArn: config.trainingDataClusterArn ?? "",
    database: config.trainingDataDatabaseName ?? "",
    region: config.region,
    secretArn: config.trainingDataSecretArn ?? "",
  };

  return {
    authContext: authContextForEvent(event, config),
    logError:
      deps.logError ?? ((message, detail) => console.error(message, detail)),
    postComment: (input) => postInstructorComment(storeConfig, input),
    trainingDataConfigured: Boolean(
      config.trainingDataClusterArn &&
        config.trainingDataDatabaseName &&
        config.trainingDataSecretArn,
    ),
  };
}

function devInfoConfigForLambda(config: LambdaConfig): DevInfoConfig {
  return (
    config.devInfo ?? {
      authMode: config.authMode,
      region: config.region,
      runtimeArn: config.runtimeArn,
      runtimeEndpointName: config.qualifier,
      runtimeQualifier: config.qualifier,
    }
  );
}

function knowledgeBaseIdsFromDevInfo(config: DevInfoConfig): KnowledgeBaseIds {
  return {
    database: config.databaseKbId,
    document: config.documentKbId,
    law: config.lawKbId,
    medical_care_law: config.medicalCareLawKbId,
    support_activity: config.supportActivityKbId,
  };
}

function authContextForEvent(event: LambdaEvent, config: LambdaConfig) {
  if (config.authMode === "dev") {
    return config.devUserId
      ? authContextFromJwtClaims(
          {
            [config.actorClaim]: config.devUserId,
            [config.userIdClaim]: config.devUserId,
          },
          {
            actorClaim: config.actorClaim,
            userIdClaim: config.userIdClaim,
          },
        )
      : undefined;
  }

  const claims = event.requestContext?.authorizer?.jwt?.claims;
  return claims
    ? authContextFromJwtClaims(claims, {
        actorClaim: config.actorClaim,
        userIdClaim: config.userIdClaim,
      })
    : undefined;
}
