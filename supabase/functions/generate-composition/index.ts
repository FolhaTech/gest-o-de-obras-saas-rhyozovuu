import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import OpenAI from 'npm:openai@4'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceName, unit } = await req.json()

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    let materials = []

    if (apiKey) {
      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a civil engineering assistant. The user will provide a custom construction service name and its unit. You must estimate a realistic generic material composition for it. Output pure JSON with a "materials" array. Each object in the array must have: "name" (string), "unit" (string, e.g. kg, l, m3, un), "coefficient" (number, quantity per 1 unit of service), "waste_percentage" (number, typical waste like 5, 10).',
          },
          {
            role: 'user',
            content: `Service: "${serviceName}". Unit: "${unit}". Provide the materials.`,
          },
        ],
        response_format: { type: 'json_object' },
      })

      const result = JSON.parse(completion.choices[0].message.content || '{"materials":[]}')
      materials = result.materials
    } else {
      // Fallback to mock data if no AI key configured
      materials = [
        { name: 'Cimento Portland CP II', unit: 'kg', coefficient: 5.5, waste_percentage: 5 },
        { name: 'Areia Média Lavada', unit: 'm3', coefficient: 0.02, waste_percentage: 10 },
        { name: 'Água', unit: 'l', coefficient: 2.0, waste_percentage: 5 },
      ]
    }

    return new Response(JSON.stringify({ materials }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
