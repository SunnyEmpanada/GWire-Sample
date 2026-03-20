import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI } from "openapi-types";

export type GetOperation = {
  path: string;
  method: "get";
  operationId: string;
  operation: OpenAPI.Operation;
};

export async function loadSpec(specPath: string): Promise<OpenAPI.Document> {
  const api = (await SwaggerParser.validate(specPath)) as OpenAPI.Document;
  return api;
}

export function listGetOperations(spec: OpenAPI.Document): GetOperation[] {
  const out: GetOperation[] = [];
  const paths = spec.paths ?? {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem?.get) continue;
    const op = pathItem.get;
    const operationId =
      op.operationId ?? path.replace(/\W/g, "_").replace(/^_/, "");
    out.push({
      path,
      method: "get",
      operationId,
      operation: { ...op, operationId },
    });
  }
  return out;
}

/** Convert OpenAPI path template to Fastify path */
export function toFastifyPath(openapiPath: string): string {
  return openapiPath.replace(/{([^}]+)}/g, ":$1");
}
