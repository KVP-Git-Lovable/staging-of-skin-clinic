import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, jsonSchema, stepCountIs, type ModelMessage } from "npm:ai@6";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const reasoning = config.model !== "openai/chat-latest";
  const result = streamText({
    model: provider.responses(config.model),
    tools: { web_search: provider.tools.webSearch({}) },
    stopWhen: stepCountIs(5),
    maxRetries: 0,
    output: Output.object({ schema: jsonSchema({ type: "object", additionalProperties: false, properties: { title: { type: "string" }, summary: { type: "string" }, clinical_protocol: { type: "string" }, contraindications: { type: "string" }, pre_post_care: { type: "string" }, complications_management: { type: "string" }, sources: { type: "string" }, is_critical: { type: "boolean" }, ai_change_summary: { type: "string" }, resources: { type: "array", items: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["link", "video"] }, title: { type: "string" }, url: { type: "string" }, note: { type: "string" } }, required: ["kind", "title", "url", "note"] } } }, required: ["title", "summary", "clinical_protocol", "contraindications", "pre_post_care", "complications_management", "sources", "is_critical", "ai_change_summary", "resources"] }) }),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { system: instructions } : {}),
    messages,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    response: () =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ sendReasoning: true }), runIdFetch),
  };
}
