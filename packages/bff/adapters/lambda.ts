/**
 * production BFF Lambda adapter。
 *
 * API Gateway event を shared BFF contract に変換し、`POST /api/chat` を Amazon Bedrock
 * AgentCore Runtime へ forward する。BFF の routing / validation / response shaping は
 * `handleBffRequest` に集約し、この file は Lambda event の適合だけを担う。
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { handleDevInfoRequest } from "../application/handle-dev-info-request.ts";
import {
  handleKnowledgeBaseDetailRequest,
  type KnowledgeBaseDetailProvider,
} from "../application/handle-knowledge-base-detail-request.ts";
import { handleMaterialCandidateRequest } from "../application/handle-material-candidate-request.ts";
import { handleProfessionalCommentRequest } from "../application/handle-professional-comment-request.ts";
import { handleBffRequest } from "../application/handle-request.ts";
import {
  handleSessionsRequest,
  type ListSessions,
} from "../application/handle-sessions-request.ts";
import { handleSoapDraftRequest } from "../application/handle-soap-draft-request.ts";
import { handleSoapGapsRequest } from "../application/handle-soap-gaps-request.ts";
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
} from "../infra/material-candidate-store.ts";
import {
  createProfessionalComment,
  listCommentsForVersion,
} from "../infra/professional-comment-store.ts";
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
