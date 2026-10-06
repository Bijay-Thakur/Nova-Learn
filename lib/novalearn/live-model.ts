export type LiveTier = "draft" | "dialogue" | "judge";

let enabled = false;
let label = "";

export function setLiveLlm(ready: boolean, modelLabel = "") {
  enabled = ready;
  label = modelLabel;
}

export function liveLlm() {
  return enabled;
}

export function liveLabel() {
  return label || "Groq";
}

export async function llmStatus() {
  const response = await fetch("/api/llm");
  const data = await response.json();
  return {
    ready: !!data.ready,
    provider: String(data.provider || ""),
    model: String(data.model || ""),
  };
}

export async function liveModel(
  system: string,
  input: unknown,
  tier: LiveTier = "draft",
) {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "complete", tier, system, input }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The model request failed.");
  return data as { value: unknown; routing: string };
}
