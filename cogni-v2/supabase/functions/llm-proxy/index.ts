// COGNI v2 — LLM Proxy
// Unified interface for multiple LLM providers (OpenAI, Anthropic, Groq)
// Normalizes response formats and handles provider-specific quirks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LLMRequest {
  provider: 'openai' | 'anthropic' | 'groq';
  model: string;
  api_key: string;
  messages: Array<{ role: string; content: string }>;
  tools?: any[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

interface LLMResponse {
  content: string;
  tool_calls?: any[];
  usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { 
      provider, 
      model, 
      api_key, 
      messages, 
      tools, 
      temperature = 0.7, 
      max_tokens = 1000,
      response_format 
    }: LLMRequest = await req.json();

    if (!provider || !model || !api_key || !messages) {
      throw new Error("Missing required fields: provider, model, api_key, messages");
    }

    console.log(`[LLM-PROXY] ${provider} / ${model} (temp: ${temperature})`);

    let response: LLMResponse;

    switch (provider) {
      case 'openai':
        response = await callOpenAI(model, api_key, messages, tools, temperature, max_tokens, response_format);
        break;
      case 'anthropic':
        response = await callAnthropic(model, api_key, messages, tools, temperature, max_tokens);
        break;
      case 'groq':
        response = await callGroq(model, api_key, messages, tools, temperature, max_tokens, response_format);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    console.log(`[LLM-PROXY] Success - ${response.usage?.total || 0} tokens`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[LLM-PROXY] Error:", error.message);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function callOpenAI(
  model: string,
  apiKey: string,
  messages: any[],
  tools: any[] | undefined,
  temperature: number,
  max_tokens: number,
  response_format?: { type: string }
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
  } else if (response_format) {
    payload.response_format = response_format;
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
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content || "",
    tool_calls: choice.message.tool_calls,
    usage: {
      prompt: data.usage.prompt_tokens,
      completion: data.usage.completion_tokens,
      total: data.usage.total_tokens
    }
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
    // Convert OpenAI tool format to Anthropic format
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
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0];

  return {
    content: content.type === 'text' ? content.text : JSON.stringify(content),
    tool_calls: content.type === 'tool_use' ? [content] : undefined,
    usage: {
      prompt: data.usage.input_tokens,
      completion: data.usage.output_tokens,
      total: data.usage.input_tokens + data.usage.output_tokens
    }
  };
}

async function callGroq(
  model: string,
  apiKey: string,
  messages: any[],
  tools: any[] | undefined,
  temperature: number,
  max_tokens: number,
  response_format?: { type: string }
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
  } else if (response_format) {
    payload.response_format = response_format;
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
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content || "",
    tool_calls: choice.message.tool_calls,
    usage: {
      prompt: data.usage.prompt_tokens,
      completion: data.usage.completion_tokens,
      total: data.usage.total_tokens
    }
  };
}
