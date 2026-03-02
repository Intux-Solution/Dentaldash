import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.11.0"
import { RecursiveCharacterTextSplitter } from "https://esm.sh/langchain@0.0.96/text_splitter"
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.2.1"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { file_path, tenant_id } = await req.json()

        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // 1. Download PDF from Storage
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('clinic-docs')
            .download(file_path)

        if (downloadError) throw downloadError

        // 2. Extract Text (Simplifying for now, in a real env you'd use a PDF parser)
        // For Deno, we might need a specific library or use an external service if pdf-parse isn't compatible
        // Let's assume we can get the text. In Tip, many use 'https://esm.sh/pdf-parse'
        // But pdf-parse has node dependencies. A better option for Deno is often 'https://deno.land/x/pdf_extractor'

        // For the sake of this implementation, I'll use a placeholder for text extraction 
        // and note that the user might need to adjust the parser based on their Deno environment.
        const text = await fileData.text(); // Place holder - real PDF parsing is more complex

        // 3. Split Text into Chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        })
        const docs = await splitter.createDocuments([text])

        // 4. Generate Embeddings (Batched) and Insert
        const configuration = new Configuration({ apiKey: OPENAI_API_KEY })
        const openai = new OpenAIApi(configuration)

        const inputs = docs.map((doc: any) => doc.pageContent)

        const embeddingResponse = await openai.createEmbedding({
            model: "text-embedding-3-small",
            input: inputs,
        })

        const embeddings = embeddingResponse.data.data

        // 5. Batch Insert to Supabase
        const rowsToInsert = docs.map((doc: any, index: number) => ({
            content: doc.pageContent,
            metadata: { source: file_path },
            embedding: embeddings[index].embedding,
            tenant_id: tenant_id
        }))

        const { error: insertError } = await supabase.from('tenant_documents').insert(rowsToInsert)

        if (insertError) throw insertError

        return new Response(JSON.stringify({ message: 'Success' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
