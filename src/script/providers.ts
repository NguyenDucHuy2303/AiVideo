export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Base64-encoded images, for vision models. */
  images?: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** JSON schema the reply must follow (constrained decoding when the provider supports it). */
  schema: object;
  temperature: number;
  onProgress?: (chars: number) => void;
}

export interface LlmProvider {
  id: string;
  model: string;
  /** Throws with an actionable message when the provider or model isn't available. */
  check(): Promise<void>;
  chat(req: ChatRequest): Promise<string>;
  /** Free the model's memory now; TTS and rendering need it more. Best effort, never throws. */
  release(): Promise<void>;
}

export const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
export const DEFAULT_OLLAMA_MODEL = "gemma3:4b";

/** Abort if the model produces nothing for this long (stuck or out of memory). */
const STALL_MS = 120_000;
const TOTAL_MS = 20 * 60_000;

export function ollama(model = DEFAULT_OLLAMA_MODEL, host = OLLAMA_HOST): LlmProvider {
  return {
    id: "ollama",
    model,
    async check() {
      let res: Response;
      try {
        res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
      } catch {
        throw new Error(`Ollama is not running at ${host}. Install it from https://ollama.com and start it (ollama serve).`);
      }
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const wanted = model.includes(":") ? model : `${model}:latest`;
      if (!names.includes(wanted)) {
        throw new Error(`model "${model}" is not pulled in Ollama. Run: ollama pull ${model}${names.length ? ` (available: ${names.join(", ")})` : ""}`);
      }
    },
    async release() {
      try {
        // keep_alive 0 unloads the model; Ollama would otherwise hold ~3 GB for 5 more minutes.
        await fetch(`${host}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, keep_alive: 0 }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Ollama unloads it on its own later.
      }
    },
    async chat(req) {
      const controller = new AbortController();
      const total = setTimeout(() => controller.abort(new Error("LLM took too long")), TOTAL_MS);
      let stall = setTimeout(() => controller.abort(new Error("LLM stopped responding")), STALL_MS);
      try {
        const res = await fetch(`${host}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages: req.messages,
            format: req.schema,
            stream: true,
            options: { temperature: req.temperature, num_ctx: 8192 },
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Ollama returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

        // Streamed NDJSON: one {"message":{"content":"…"},"done":false} object per line.
        let content = "";
        let buffer = "";
        const decoder = new TextDecoder();
        for await (const chunk of res.body) {
          clearTimeout(stall);
          stall = setTimeout(() => controller.abort(new Error("LLM stopped responding")), STALL_MS);
          buffer += decoder.decode(chunk as Uint8Array, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
            if (msg.error) throw new Error(`Ollama: ${msg.error}`);
            content += msg.message?.content ?? "";
            req.onProgress?.(content.length);
          }
        }
        return content;
      } catch (err) {
        const reason = controller.signal.reason as Error | undefined;
        throw reason instanceof Error ? reason : err;
      } finally {
        clearTimeout(total);
        clearTimeout(stall);
      }
    },
  };
}
