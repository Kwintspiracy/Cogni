// COGNI v2 — Upload Knowledge
// Ingests content into knowledge_chunks with embeddings for RAG retrieval
// Splits content into ~500-word chunks, generates embeddings via generate-embedding

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Split text into chunks of approximately `maxWords` words, breaking at paragraph/sentence boundaries
function splitIntoChunks(text: string, maxWords: number = 500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const paragraphWords = trimmed.split(/\s+/).length;

    // If adding this paragraph would exceed the limit, finalize the current chunk
    if (currentWordCount > 0 && currentWordCount + paragraphWords > maxWords) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
      currentWordCount = 0;
    }

    // If a single paragraph exceeds maxWords, split it by sentences
    if (paragraphWords > maxWords) {
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/).length;
        if (currentWordCount + sentenceWords > maxWords && currentWordCount > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
          currentWordCount = 0;
        }
        currentChunk += (currentChunk ? " " : "") + sentence;
        currentWordCount += sentenceWords;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
      currentWordCount += paragraphWords;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const { knowledge_base_id, content, source_document, chunk_size } = body;

    if (!knowledge_base_id) throw new Error("knowledge_base_id is required");
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      throw new Error("content is required and must be a non-empty string");
    }

    // Validate knowledge base exists
    const { data: kb, error: kbError } = await supabaseClient
      .from("knowledge_bases")
      .select("id, name")
      .eq("id", knowledge_base_id)
      .single();

    if (kbError || !kb) {
      throw new Error("Knowledge base not found: " + knowledge_base_id);
    }

    const maxWords = chunk_size || 500;
    const sourceDoc = source_document || "unknown";

    console.log(`[UPLOAD-KB] Uploading to KB '${kb.name}' (${knowledge_base_id}), source: ${sourceDoc}`);

    // Split content into chunks
    const chunks = splitIntoChunks(content, maxWords);
    console.log(`[UPLOAD-KB] Split into ${chunks.length} chunks (~${maxWords} words each)`);

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ success: true, chunks_created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Generate embeddings for all chunks (batch if possible, otherwise one by one)
    let embeddings: number[][] = [];

    if (chunks.length <= 20) {
      // Batch embedding: send all chunks at once
      try {
        const embeddingResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ texts: chunks })
          }
        );

        if (!embeddingResponse.ok) {
          throw new Error(`Embedding API error: ${await embeddingResponse.text()}`);
        }

        const embedData = await embeddingResponse.json();
        embeddings = embedData.embeddings;
        console.log(`[UPLOAD-KB] Generated ${embeddings.length} embeddings (batch)`);
      } catch (e: any) {
        console.error("[UPLOAD-KB] Batch embedding failed, falling back to individual:", e.message);
        embeddings = [];
      }
    }

    // Fallback: generate embeddings individually
    if (embeddings.length === 0) {
      for (const chunk of chunks) {
        try {
          const embeddingResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-embedding`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ text: chunk })
            }
          );

          if (embeddingResponse.ok) {
            const embedData = await embeddingResponse.json();
            embeddings.push(embedData.embedding);
          } else {
            console.error("[UPLOAD-KB] Individual embedding failed for chunk, using null");
            embeddings.push([]);
          }
        } catch (_e: any) {
          embeddings.push([]);
        }
      }
      console.log(`[UPLOAD-KB] Generated ${embeddings.filter(e => e.length > 0).length}/${chunks.length} embeddings (individual)`);
    }

    // Insert chunks into knowledge_chunks table
    let chunksCreated = 0;
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddings[i] && embeddings[i].length > 0 ? embeddings[i] : null;

      const { error: insertError } = await supabaseClient
        .from("knowledge_chunks")
        .insert({
          knowledge_base_id: knowledge_base_id,
          content: chunks[i],
          embedding: embedding,
          source_document: sourceDoc,
          chunk_index: i,
        });

      if (insertError) {
        console.error(`[UPLOAD-KB] Failed to insert chunk ${i}:`, insertError.message);
      } else {
        chunksCreated++;
      }
    }

    console.log(`[UPLOAD-KB] Successfully created ${chunksCreated}/${chunks.length} chunks`);

    return new Response(JSON.stringify({
      success: true,
      knowledge_base_id: knowledge_base_id,
      knowledge_base_name: kb.name,
      source_document: sourceDoc,
      chunks_created: chunksCreated,
      total_chunks: chunks.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[UPLOAD-KB] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
