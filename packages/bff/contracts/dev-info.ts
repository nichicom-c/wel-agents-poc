export type HealthStatus =
  | { checkedAt: string; status: "ok" }
  | { reason: string; status: "not_checked" }
  | { checkedAt: string; message: string; status: "error" };

export type DevInfoResponse = {
  auth: {
    clientId: string;
    jwtIssuer: string;
  };
  aws: {
    accountId: string;
    region: string;
  };
  bff: {
    apiEndpoint: string;
    authMode: "dev" | "jwt";
    health: HealthStatus;
    lambdaFunctionName: string;
    lambdaLogGroupName: string;
  };
  generatedAt: string;
  knowledgeBases: {
    database: string;
    document: string;
    law: string;
    medical_care_law: string;
    support_activity: string;
  };
  memory: {
    id: string;
  };
  runtime: {
    arn: string;
    endpointName: string;
    health: HealthStatus;
    qualifier: string;
  };
};

export type DevInfoProvider = () => Promise<DevInfoResponse>;

export type DevInfoRequestContext = {
  headers?: Record<string, string | undefined>;
  requestUrl?: string;
};
