import type { AuditRequest } from "../contracts";

export type CloudStartResponse = {
  externalRunId: string;
  status: string;
};

export type CloudAuditPayload = Record<string, unknown>;

export type CloudBrowserClient = {
  startAudit(payload: AuditRequest): Promise<CloudStartResponse>;
  getAudit(externalRunId: string): Promise<CloudAuditPayload>;
  cancelAudit(externalRunId: string): Promise<void>;
};
