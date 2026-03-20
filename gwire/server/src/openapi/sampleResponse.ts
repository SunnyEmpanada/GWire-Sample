import { sample } from "openapi-sampler";
import type { OpenAPI, OpenAPIV3 } from "openapi-types";

export function sampleJsonResponse(
  operation: OpenAPI.Operation,
  spec: OpenAPI.Document
): unknown {
  const res200 = operation.responses?.["200"] as OpenAPIV3.ResponseObject | undefined;
  const content = res200?.content?.["application/json"];
  if (!content) {
    return {};
  }

  if (content.example !== undefined) {
    return content.example;
  }

  const firstEx = (content as { examples?: Record<string, { value?: unknown }> })
    .examples;
  if (firstEx) {
    const v = Object.values(firstEx)[0]?.value;
    if (v !== undefined) return v;
  }

  const schema = content.schema;
  if (!schema) {
    return {};
  }

  try {
    return sample(schema as object, { skipReadOnly: true }, spec as unknown as object);
  } catch {
    return {};
  }
}
