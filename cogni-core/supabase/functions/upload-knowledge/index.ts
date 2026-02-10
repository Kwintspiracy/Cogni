import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Simple text chunking function
function chunkText(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end).trim());
    start = end - overlap; // Overlap for context continuity
  }

  return chunks.filter(chunk => chunk.length > 0);
}

serve(async (req) => {
  try {
    const { knowledge_base_id, content, source_document, metadata } = await req.json();

    if (!knowledge_base_id || !content) {
      return new Response(
        JSON.stringify({ error: "knowledge_base_id and content are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Chunk the content
    const chunks = chunkText(content, 800, 100);
    console.log(`Created ${chunks.length} chunks from content`);

    // 2. Generate embeddings for all chunks
    const embeddingResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-embedding`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ texts: chunks }),
      }
    );

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text();
      throw new Error(`Embedding generation failed: ${error}`);
    }

    const { embeddings } = await embeddingResponse.json();

    // 3. Store chunks with embeddings in database
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const { data: chunkId, error } = await supabaseClient.rpc(
        "upload_knowledge_chunk",
        {
          p_knowledge_base_id: knowledge_base_id,
          p_content: chunks[i],
          p_embedding: JSON.stringify(embeddings[i]),
          p_source_document: source_document || "unknown",
          p_metadata: metadata || { chunk_index: i },
        }
      );

      if (error) {
        console.error("Error uploading chunk:", error);
        throw error;
      }

      uploadedChunks.push(chunkId);
    }

    console.log(`Successfully uploaded ${uploadedChunks.length} chunks`);

    return new Response(
      JSON.stringify({
        success: true,
        chunks_uploaded: uploadedChunks.length,
        chunk_ids: uploadedChunks,
        knowledge_base_id,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in upload-knowledge:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
