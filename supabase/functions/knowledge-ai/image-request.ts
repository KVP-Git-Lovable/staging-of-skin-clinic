export function generateKnowledgeImage(apiKey: string, prompt: string, stream: boolean, signal: AbortSignal) {
  return fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-image-2.5-sunburst", prompt, size: "1024x1024", quality: "medium", ...(stream ? { stream: true, partial_images: 1 } : {}) }),
    signal,
  });
}