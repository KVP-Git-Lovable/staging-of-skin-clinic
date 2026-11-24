import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, jsonSchema, stepCountIs, type ModelMessage } from "npm:ai@6";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

/** The article draft's shape - ten fields and a resource list. */
export const ARTICLE_SCHEMA = { type: "object", additionalProperties: false, properties: { title: { type: "string" }, summary: { type: "string" }, clinical_protocol: { type: "string" }, contraindications: { type: "string" }, pre_post_care: { type: "string" }, complications_management: { type: "string" }, sources: { type: "string" }, is_critical: { type: "boolean" }, ai_change_summary: { type: "string" }, resources: { type: "array", items: { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["link", "video"] }, title: { type: "string" }, url: { type: "string" }, note: { type: "string" } }, required: ["kind", "title", "url", "note"] } } }, required: ["title", "summary", "clinical_protocol", "contraindications", "pre_post_care", "complications_management", "sources", "is_critical", "ai_change_summary", "resources"] };

/**
 * The patient summary's shape.
 *
 * Every field required, because the schema cannot express "fill this in only if
 * the article says so" - the instructions carry that, and an empty string is
 * how the model declines a card it has no evidence for. patientFacts() on the
 * client drops the empties, so an unanswerable card is simply not drawn.
 */
export const PATIENT_SUMMARY_SCHEMA = { type: "object", additionalProperties: false, properties: { patient_summary: { type: "string" }, ai_change_summary: { type: "string" }, patient_facts: { type: "object", additionalProperties: false, properties: { sessions: { type: "string" }, each_visit: { type: "string" }, downtime: { type: "string" }, comfort: { type: "string" }, results_when: { type: "string" }, dos: { type: "array", items: { type: "string" } }, donts: { type: "array", items: { type: "string" } }, timeline: { type: "array", items: { type: "object", additionalProperties: false, properties: { when: { type: "string" }, what: { type: "string" } }, required: ["when", "what"] } } }, required: ["sessions", "each_visit", "downtime", "comfort", "results_when", "dos", "donts", "timeline"] } }, required: ["patient_summary", "patient_facts", "ai_change_summary"] };

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
  /**
   * `schema` defaults to the article draft. `webSearch` defaults to on, but the
   * patient summary turns it OFF deliberately: it rewrites text a doctor has
   * already approved, and a web result reaching it would be an unreviewed
   * clinical claim arriving by the back door, in the one version of the article
   * written to be handed straight to a patient.
   */
  options: { schema?: Record<string, unknown>; webSearch?: boolean } = {},
) {
  const { schema = ARTICLE_SCHEMA, webSearch = true } = options;
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
    ...(webSearch ? { tools: { web_search: provider.tools.webSearch({}) } } : {}),
    stopWhen: stepCountIs(5),
    maxRetries: 0,
    output: Output.object({ schema: jsonSchema(schema) }),
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
