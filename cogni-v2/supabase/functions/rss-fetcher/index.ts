// COGNI v2 — RSS Fetcher
// Fetches RSS/Atom feeds from agent_sources, parses items, generates embeddings,
// and stores them as knowledge_chunks for RAG retrieval.
// Triggered by pg_cron every 6 hours.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── RSS / Atom Parsing ─────────────────────────────────────────────────────

interface FeedItem {
  title: string;
  description: string;
  link: string;
  guid: string;
  pubDate: string;
}

/** Extract text content from an XML element, stripping CDATA wrappers and HTML tags. */
function extractText(xml: string, tag: string): string {
  // Match <tag>...</tag> or <tag ...>...</tag>
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return "";
  let text = match[1].trim();
  // Strip CDATA
  text = text.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
  return text.trim();
}

/** Extract href from Atom-style <link href="..."/> or <link href="..." ... /> */
function extractAtomLink(entryXml: string): string {
  // Prefer alternate link
  const altMatch = entryXml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (altMatch) return altMatch[1];
  // Fallback to any link with href
  const hrefMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  return "";
}

/** Parse RSS 2.0 <item> elements */
function parseRss2Items(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, "title");
    const description = extractText(block, "description") || extractText(block, "content:encoded");
    const link = extractText(block, "link") || extractAtomLink(block);
    const guid = extractText(block, "guid") || link;
    const pubDate = extractText(block, "pubDate") || extractText(block, "dc:date");
    if (title || description) {
      items.push({ title, description, link, guid, pubDate });
    }
  }
  return items;
}

/** Parse Atom <entry> elements */
function parseAtomEntries(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, "title");
    const description = extractText(block, "summary") || extractText(block, "content");
    const link = extractAtomLink(block);
    const guid = extractText(block, "id") || link;
    const pubDate = extractText(block, "published") || extractText(block, "updated");
    if (title || description) {
      items.push({ title, description, link, guid, pubDate });
    }
  }
  return items;
}

/** Detect feed type and parse accordingly */
function parseFeed(xml: string): FeedItem[] {
  // Atom feeds have <feed> root or xmlns="http://www.w3.org/2005/Atom"
  if (/<feed[\s>]/i.test(xml) || /xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml)) {
    return parseAtomEntries(xml);
  }
  // Default: RSS 2.0
  return parseRss2Items(xml);
}

// ── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Query feeds due for fetching
    const { data: feeds, error: feedsError } = await supabase
      .from("agent_sources")
      .select("*")
      .eq("source_type", "rss")
      .eq("is_active", true)
      .or("last_fetched_at.is.null,last_fetched_at.lt." + new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());

    if (feedsError) {
      throw new Error("Failed to query feeds: " + feedsError.message);
    }

    if (!feeds || feeds.length === 0) {
      console.log("[RSS] No feeds due for fetching");
      return new Response(JSON.stringify({
        success: true,
        feeds_processed: 0,
        items_added: 0,
        items_pruned: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`[RSS] Found ${feeds.length} feed(s) due for fetching`);

    let totalItemsAdded = 0;
    let totalFeedsProcessed = 0;

    for (const feed of feeds) {
      try {
        console.log(`[RSS] Fetching feed: ${feed.label || feed.url}`);

        // 2. Fetch the XML
        const feedResponse = await fetch(feed.url, {
          headers: { "User-Agent": "Cogni-RSS-Fetcher/1.0" },
        });

        if (!feedResponse.ok) {
          console.error(`[RSS] Failed to fetch ${feed.url}: HTTP ${feedResponse.status}`);
          continue;
        }

        const xml = await feedResponse.text();
        const items = parseFeed(xml);
        console.log(`[RSS] Parsed ${items.length} item(s) from ${feed.label || feed.url}`);

        // 3. Determine target knowledge base
        let targetKbId: string | null = null;

        if (feed.agent_id) {
          // Agent-specific feed: look up agent's knowledge_base_id
          const { data: agent } = await supabase
            .from("agents")
            .select("knowledge_base_id")
            .eq("id", feed.agent_id)
            .single();

          targetKbId = agent?.knowledge_base_id ?? null;
        } else if (feed.is_global) {
          // Global feed: look up global knowledge base
          const { data: globalKb } = await supabase
            .from("knowledge_bases")
            .select("id")
            .eq("is_global", true)
            .limit(1)
            .single();

          targetKbId = globalKb?.id ?? null;
        }

        if (!targetKbId) {
          console.warn(`[RSS] No knowledge base found for feed ${feed.id}, skipping`);
          // Still update last_fetched_at so we don't retry immediately
          await supabase
            .from("agent_sources")
            .update({ last_fetched_at: new Date().toISOString() })
            .eq("id", feed.id);
          continue;
        }

        // 4. Process items (max 10 per feed per cycle)
        let itemsAdded = 0;
        const itemsToProcess = items.slice(0, 10);

        for (const item of itemsToProcess) {
          const itemGuid = item.guid || item.link || item.title;
          if (!itemGuid) continue;

          // Deduplicate: check if this guid already exists in knowledge_chunks
          const { data: existing } = await supabase
            .from("knowledge_chunks")
            .select("id")
            .eq("knowledge_base_id", targetKbId)
            .contains("metadata", { rss_guid: itemGuid })
            .limit(1);

          if (existing && existing.length > 0) {
            continue; // Already ingested
          }

          // Build content text (truncate to 2000 chars)
          let contentText = item.title;
          if (item.description) {
            contentText += "\n\n" + item.description;
          }
          contentText = contentText.substring(0, 2000);

          // 5. Generate embedding
          let embedding: number[] | null = null;
          try {
            const embeddingResponse = await fetch(
              `${supabaseUrl}/functions/v1/generate-embedding`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${serviceRoleKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ text: contentText }),
              }
            );

            if (embeddingResponse.ok) {
              const embedData = await embeddingResponse.json();
              embedding = embedData.embedding;
            } else {
              console.error(`[RSS] Embedding failed for item "${item.title}": HTTP ${embeddingResponse.status}`);
            }
          } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[RSS] Embedding error for item "${item.title}":`, errMsg);
          }

          // 6. Insert into knowledge_chunks
          const { error: insertError } = await supabase
            .from("knowledge_chunks")
            .insert({
              knowledge_base_id: targetKbId,
              content: contentText,
              embedding: embedding,
              source_document: `rss:${feed.url}`,
              chunk_index: 0,
              metadata: {
                rss_guid: itemGuid,
                rss_url: feed.url,
                rss_pub_date: item.pubDate || null,
                rss_link: item.link || null,
                rss_feed_label: feed.label || feed.url,
              },
            });

          if (insertError) {
            console.error(`[RSS] Insert failed for "${item.title}":`, insertError.message);
          } else {
            itemsAdded++;
          }
        }

        totalItemsAdded += itemsAdded;
        totalFeedsProcessed++;
        console.log(`[RSS] Added ${itemsAdded} item(s) from ${feed.label || feed.url}`);

        // 7. Update last_fetched_at
        await supabase
          .from("agent_sources")
          .update({ last_fetched_at: new Date().toISOString() })
          .eq("id", feed.id);

      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[RSS] Error processing feed ${feed.url}:`, errMsg);
      }
    }

    // 8. Prune old RSS chunks (older than 7 days)
    const pruneThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldChunks, error: pruneQueryError } = await supabase
      .from("knowledge_chunks")
      .select("id, metadata")
      .not("metadata->rss_guid", "is", null)
      .lt("created_at", pruneThreshold);

    let itemsPruned = 0;
    if (!pruneQueryError && oldChunks && oldChunks.length > 0) {
      const idsToDelete = oldChunks.map((c: { id: string }) => c.id);
      const { error: deleteError } = await supabase
        .from("knowledge_chunks")
        .delete()
        .in("id", idsToDelete);

      if (!deleteError) {
        itemsPruned = idsToDelete.length;
        console.log(`[RSS] Pruned ${itemsPruned} old RSS chunk(s)`);
      } else {
        console.error("[RSS] Prune delete error:", deleteError.message);
      }
    }

    console.log(`[RSS] Complete: ${totalFeedsProcessed} feeds, ${totalItemsAdded} added, ${itemsPruned} pruned`);

    return new Response(JSON.stringify({
      success: true,
      feeds_processed: totalFeedsProcessed,
      items_added: totalItemsAdded,
      items_pruned: itemsPruned,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[RSS] Fatal error:", errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
