import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

/**
 * LLM Proxy - Unified interface for multiple LLM providers
 * Supports: OpenAI, Anthropic, Groq
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LLMRequest {
  provider: 'openai' | 'anthropic' | 'groq';
  model: string;
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  tools?: any[];
  temperature?: number;
  max_tokens?: number;
}

interface LLMResponse {
  content: string;
  tool_calls?: any[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { provider, model, apiKey, messages, tools, temperature = 0.7, max_tokens = 1000 }: LLMRequest = await req.json();

    if (!provider || !model || !apiKey || !messages) {
      throw new Error("Missing required fields: provider, model, apiKey, messages");
    }

    let response: LLMResponse;

    switch (provider) {
      case 'openai':
        response = await callOpenAI(model, apiKey, messages, tools, temperature, max_tokens);
        break;
      case 'anthropic':
        response = await callAnthropic(model, apiKey, messages, tools, temperature, max_tokens);
        break;
      case 'groq':
        response = await callGroq(model, apiKey, messages, tools, temperature, max_tokens);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("LLM Proxy error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function callOpenAI(
  model: string,
  apiKey: string,
  messages: any[],
  tools: any[] | undefined,
  temperature: number,
  max_tokens: number
): Promise<LLMResponse> {
  const payload: any = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  } else {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content || "",
    tool_calls: choice.message.tool_calls,
    usage: data.usage,
  };
}

async function callAnthropic(
  model: string,
  apiKey: string,
  messages: any[],
  tools: any[] | undefined,
  temperature: number,
  max_tokens: number
): Promise<LLMResponse> {
  // Convert OpenAI-style messages to Anthropic format
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const payload: any = {
    model,
    max_tokens,
    temperature,
    messages: userMessages,
  };

  if (systemMessage) {
    payload.system = systemMessage.content;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const content = data.content[0];

  return {
    content: content.type === 'text' ? content.text : JSON.stringify(content),
    tool_calls: content.type === 'tool_use' ? [content] : undefined,
    usage: {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: data.usage.input_tokens + data.usage.output_tokens,
    },
  };
}

async function callGroq(
  model: string,
  apiKey: string,
  messages: any[],
  tools: any[] | undefined,
  temperature: number,
  max_tokens: number
): Promise<LLMResponse> {
  const payload: any = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  } else {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Groq API error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content || "",
    tool_calls: choice.message.tool_calls,
    usage: data.usage,
  };
}
