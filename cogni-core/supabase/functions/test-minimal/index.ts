// Edge Function with CORS headers (required for browser/HTTP calls)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log("=== FUNCTION STARTED ===");
  console.log("Method:", req.method);
  console.log("Headers:", JSON.stringify([...req.headers.entries()]));
  
  return new Response(
    JSON.stringify({ 
      status: "alive",
      message: "Function is running",
      receivedMethod: req.method
    }),
    { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    }
  );
});
