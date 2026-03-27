// COGNI v2 — Generate Embedding
// OpenAI text-embedding-3-small wrapper for MemoryBank and Novelty Gate

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get OpenAI API key from environment
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable not configured");
    }

    const body = await req.json();
    
    // Accept both single text and array of texts
    let texts: string[];
    let isSingleInput = false;
    
    if (typeof body.text === "string") {
      // Single text input
      texts = [body.text];
      isSingleInput = true;
    } else if (Array.isArray(body.texts)) {
      // Array of texts
      texts = body.texts;
    } else {
      throw new Error("Either 'text' (string) or 'texts' (array) is required");
    }

    // Validate inputs
    if (texts.length === 0) {
      throw new Error("Cannot generate embeddings for empty input");
    }

    if (texts.some(t => typeof t !== "string" || t.trim().length === 0)) {
      throw new Error("All texts must be non-empty strings");
    }

    console.log(`[EMBEDDING] Generating ${texts.length} embedding(s)...`);

    // Call OpenAI embeddings API
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float" // Explicit float format
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[EMBEDDING] OpenAI API error:", errorText);
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const embeddings = data.data.map((item: any) => item.embedding);

    console.log(`[EMBEDDING] Generated ${embeddings.length} embedding(s) successfully`);

    // Return single embedding or array based on input
    const result = isSingleInput 
      ? { 
          embedding: embeddings[0],
          model: data.model,
          usage: data.usage
        }
      : { 
          embeddings: embeddings,
          model: data.model,
          usage: data.usage
        };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[EMBEDDING] Error:", error.message);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
