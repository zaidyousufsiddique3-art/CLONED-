
import OpenAI from 'openai';
import { createRateLimiter, getClientIp } from './_lib/rateLimit';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: any, res: any) {
    // RATE LIMITING (AI/Extraction: 10 req / 5 min)
    try {
        const limiter = createRateLimiter(10, "5 m");
        const ip = getClientIp(req);
        const { success } = await limiter.limit(`extract:${ip}`);

        if (!success) {
            return res.status(429).json({
                error: "Too many requests. Please wait a few minutes and try again."
            });
        }
    } catch (err) {
        console.error("Rate limiting error:", err);
        return res.status(503).json({ error: "Service temporarily unavailable (Rate Limit Check Failed)" });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a strict data extraction assistant. 
          Extract student exam results from the provided text.
          
          For EACH student found in the text, identify:
          - CANDIDATE NAME (string)
          - UNIQUE CANDIDATE IDENTIFIER (string, usually 13 chars)
          - DATE OF BIRTH (string, DD/MM/YYYY or similar)
          - GRADES: An array of objects with { "subject": string, "grade": string }. 
            - Only extract final grades from "AWARD" lines if possible. 
            - Example: "MATHEMATICS" -> "A". 
            - Format grade as e.g. "C(c)" or "A*".
          
          Return a strict JSON object with a single key "students" containing an array of these student objects.
          Example:
          {
            "students": [
              {
                "candidateName": "JOHN DOE",
                "uci": "97293B...",
                "dob": "01/01/2000",
                "grades": [
                   { "subject": "MATH", "grade": "C(c)", "code": "WMA11" }
                ]
              }
            ]
          }
          
          If code is not found, omit it or guess.
          Ensure no markdown formatting (no \`\`\`), just pure JSON.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        const data = JSON.parse(content);

        return res.status(200).json(data);

    } catch (error) {
        console.error("OpenAI API Error:", error);
        return res.status(500).json({ error: 'Error processing extraction', details: error.message });
    }
}
