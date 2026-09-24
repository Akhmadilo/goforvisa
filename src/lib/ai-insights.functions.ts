import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  lang: z.enum(["uz", "en", "ru"]),
  period: z.string().max(100),
  data: z.string().max(8000),
});

export const generateAiInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI sozlanmagan (LOVABLE_API_KEY yo'q)");
    const { streamText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { createLovableAiGatewayRunIdFetch } = await import("./ai-gateway.server");
    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch as typeof fetch,
    });
    const langName = { uz: "Uzbek (Latin script)", en: "English", ru: "Russian" }[data.lang];
    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        system:
          `You are the CFO advisor of a visa-consulting company. Write in ${langName}. ` +
          "Analyse the monthly financial metrics (amounts in UZS). Output plain markdown, maximum ~250 words: " +
          "1) a 2-sentence overall verdict, 2) 'Sabablar/Reasons' — 3 bullets explaining likely causes of the biggest changes, " +
          "3) 'Xavflar/Risks' — up to 3 bullets, 4) 'Tavsiyalar/Recommendations' — 3 concrete actions for next month. " +
          "Use only the numbers provided; do not invent data.",
        prompt: `Period: ${data.period}\n\n${data.data}`,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = await result.text;
      return { text: text || "—" };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      if (status === 402) throw new Error("AI kreditlari tugagan. Sozlamalar → Plans & credits.");
      if (status === 429) throw new Error("Juda ko'p so'rov, birozdan so'ng urinib ko'ring.");
      throw new Error(e?.message ?? "AI xatosi");
    }
  });
