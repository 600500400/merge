
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssistantRequest {
  message: string;
  context?: {
    userId: string;
    currentSubject?: 'math' | 'spelling';
    recentErrors?: string[];
    userStats?: any;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, context }: AssistantRequest = await req.json();
    
    console.log('AI Assistant request:', { message, context });

    if (!openAIApiKey) {
      console.error('OpenAI API key is missing');
      return new Response(JSON.stringify({ 
        error: 'API klíč není nastaven. Kontaktujte administrátora.',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build context-aware system prompt
    let systemPrompt = `Jsi AI studentský asistent pro českou vzdělávací aplikaci. Tvoje role:

1. Pomáháš dětem s matematikou a pravopisem v češtině
2. Analyzuješ jejich chyby a poskytuj personalizované tipy
3. Buď pozitivní, povzbudivý a přátelský
4. Používej jednoduché výrazy vhodné pro děti
5. Dávej konkrétní, praktické rady
6. Oslavuj pokroky a úspěchy

Tvoje odpovědi by měly být:
- Krátké a srozumitelné (maximálně 2-3 věty)
- Pozitivní a motivující
- Praktické s konkrétními tipy
- V češtině`;

    if (context?.currentSubject) {
      systemPrompt += `\n\nAktuální předmět: ${context.currentSubject === 'math' ? 'matematika' : 'pravopis'}`;
    }

    if (context?.recentErrors?.length) {
      systemPrompt += `\n\nNedávné chyby studenta: ${context.recentErrors.join(', ')}
Zaměř se na tyto oblasti a poskytni tipy pro zlepšení.`;
    }

    console.log('Sending request to OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    
    console.log('OpenAI response status:', response.status);
    console.log('OpenAI response data:', data);
    
    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      
      let errorMessage = 'Promiň, teď nemůžu odpovědět. ';
      
      if (data.error?.code === 'insufficient_quota') {
        errorMessage += 'API kvóta byla vyčerpána.';
      } else if (data.error?.code === 'rate_limit_exceeded') {
        errorMessage += 'Příliš mnoho požadavků najednou.';
      } else if (data.error?.code === 'invalid_api_key') {
        errorMessage += 'API klíč není platný.';
      } else {
        errorMessage += 'Zkus to prosím později.';
      }
      
      return new Response(JSON.stringify({ 
        error: errorMessage,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const assistantResponse = data.choices[0]?.message?.content;
    
    if (!assistantResponse) {
      throw new Error('Prázdná odpověď z OpenAI');
    }
    
    console.log('AI Assistant response:', assistantResponse);

    return new Response(JSON.stringify({ 
      response: assistantResponse,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in AI assistant function:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Promiň, teď nemůžu odpovědět. Zkus to prosím později.',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
