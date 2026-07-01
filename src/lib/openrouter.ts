// OpenRouter fallback — used when Gemini's whole model chain exhausts (rate
// limits, 5xx, safety blocks, etc). OpenRouter proxies to Claude / GPT / etc
// via an OpenAI-compatible chat completions endpoint.

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  )[];
}

export interface OpenRouterResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string;
}

// Ordered fallback list. Free models come first so no money is spent unless
// they exhaust their (small) daily quotas. Paid models kick in only after
// that and only if the OpenRouter account actually has credit.
// Model IDs verified against OpenRouter's live /api/v1/models list.
export const OPENROUTER_MODELS = [
  // Free tier — usually ~20-50 requests/day per model, no charge.
  // Ordered by expected quality for study-guide / chat use cases.
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openai/gpt-oss-120b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
  // Paid fallback — only used if the above are all exhausted AND the OpenRouter
  // account has credit. Cheapest strong options first.
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4.5",
];

export function isOpenRouterConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return !!key && key !== "your_key_here" && key.trim().length > 0;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  opts: { models?: string[]; maxTokens?: number } = {}
): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const models = opts.models || OPENROUTER_MODELS;
  const maxTokens = opts.maxTokens ?? 8192;

  let lastError = "";
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://summar-ai.vercel.app",
          "X-Title": "Summar AI",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
        }),
      });

      const raw = await res.text();
      let body: {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string; code?: number };
      };
      try {
        body = JSON.parse(raw);
      } catch {
        lastError = `${model}: non-JSON response`;
        continue;
      }

      if (!res.ok || body.error) {
        const code = body.error?.code ?? res.status;
        lastError = `${model}: ${body.error?.message || `HTTP ${res.status}`}`;
        // 429 / 5xx / model unavailable — try the next one.
        if (code === 429 || code === 502 || code === 503 || code === 504 || code === 500) continue;
        // Some other error (auth, bad request) — bail immediately.
        throw new Error(lastError);
      }

      const text = body.choices?.[0]?.message?.content;
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }

      return {
        text,
        tokensIn: body.usage?.prompt_tokens ?? 0,
        tokensOut: body.usage?.completion_tokens ?? 0,
        modelUsed: model,
      };
    } catch (e: unknown) {
      lastError = `${model}: ${e instanceof Error ? e.message : "unknown error"}`;
      continue;
    }
  }
  throw new Error(`OpenRouter fallback exhausted. Last: ${lastError}`);
}
