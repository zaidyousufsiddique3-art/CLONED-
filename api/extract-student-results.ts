
import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
}

const storage = admin.storage();

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

interface ExtractedGrade {
    code?: string;
    subject: string;
    grade: string;
}

interface StudentResult {
    candidateName: string;
    uci: string;
    dob: string;
    grades: ExtractedGrade[];
    rawText?: string;
}
// --- Parsing Logic (Mirrored from extractionService.ts) ---

const normalizeText = (text: string): string => {
    if (!text) return '';
    let normalized = text
        // Fix Common OCR keywords
        .replace(/C\s+A\s+N\s+D\s+I\s+D\s+A\s+T\s+E/gi, "CANDIDATE")
        .replace(/CAND[1lI]DATE/gi, "CANDIDATE")
        .replace(/UN[1lI]QUE/gi, "UNIQUE")
        .replace(/NO\. AND/gi, "NO. AND")
        .replace(/N\s+O/gi, "NO")
        .replace(/N\s+A\s+M\s+E/gi, "NAME")
        .replace(/A\s+N\s+D/gi, "AND")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH")

        // Critical: Fix "A W A R D" -> "AWARD"
        .replace(/A\s+W\s+A\s+R\s+D/gi, "AWARD")
        .replace(/\bA\s+W\s+A\s+R\s+D\b/gi, "AWARD")
        .replace(/A\s+WARD/gi, "AWARD")
        .replace(/AWA\s+RD/gi, "AWARD")

        // Force Newline ONLY before keywords to ensure they start lines
        // IMPORTANT: Do NOT break lines usually. 
        // We only want to ensure 'AWARD', 'UNIT' are strictly start-of-line tokens if valid.
        .replace(/AWARD/gi, '\nAWARD')
        .replace(/UNIT/gi, '\nUNIT')
        .replace(/Contributing/gi, '\nContributing')

        // General whitespace collapse
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n');

    return normalized;
};

const parseStudentBlock = (text: string): StudentResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let candidateName = 'Unknown Candidate';
    let uci = 'Unknown UCI';
    let dob = 'Unknown DOB';

    // 1. Header Extraction
    const nameMatch = text.match(/CANDIDATE\s+NAME\s*(?:[:.]|)?\s*(?:(\d{4}))?\s*(?:[:.]|)?\s*([A-Z\s\.\-:]+)/i);
    if (nameMatch) {
        let raw = nameMatch[2].trim();
        ['UNIQUE', 'DATE', 'CENTRE'].forEach(stop => {
            const idx = raw.toUpperCase().indexOf(stop);
            if (idx !== -1) raw = raw.substring(0, idx);
        });
        candidateName = raw.trim();
    }

    const uciMatch = text.match(/UNIQUE\s+CANDIDATE\s+IDENTIFIER\s*[:\.]?\s*([A-Z0-9]+)/i);
    if (uciMatch) uci = uciMatch[1];
    else {
        const fallback = text.match(/\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/);
        if (fallback) uci = fallback[0];
    }

    const dobMatch = text.match(/DATE\s+OF\s+BIRTH\s*[:\.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    if (dobMatch) dob = dobMatch[1];


    // 2. AWARD BUFFERING LOGIC (CONDITIONAL TERMINATION)
    const grades: ExtractedGrade[] = [];

    let currentBlock = "";
    let isCapture = false;
    let debugLogged = false;

    const startsWithKeyword = (line: string, keyword: string) => {
        return line.toUpperCase().startsWith(keyword.toUpperCase());
    };

    // Grade Regex (B(b))
    const gradeRegex = /([A-Z])\([a-z]\)/;

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        // Check if START of new Award
        if (startsWithKeyword(cleanLine, 'AWARD')) {
            // If we have a previous block, flush it
            if (currentBlock) processAwardBlock(currentBlock, grades, !debugLogged ? (l) => { console.log(l); debugLogged = true; } : undefined);

            // Start new capture
            currentBlock = cleanLine;
            isCapture = true;
        }
        // Check hard boundaries that ALWAYS stop an award (Next Student specific)
        else if (cleanLine.includes("UNIQUE CANDIDATE") || startsWithKeyword(cleanLine, 'CANDIDATE NAME')) {
            if (currentBlock) processAwardBlock(currentBlock, grades);
            currentBlock = "";
            isCapture = false;
        }
        else {
            if (isCapture) {
                // Check if we SHOULD stop for UNIT/Contributing
                // Rule: Only stop if we ALREADY have a Grade.
                const hasGrade = gradeRegex.test(currentBlock);
                const isTerminator = startsWithKeyword(cleanLine, 'UNIT') || startsWithKeyword(cleanLine, 'Contributing');

                if (hasGrade && isTerminator) {
                    // We have a full award block, and hit a terminator. Done.
                    processAwardBlock(currentBlock, grades, !debugLogged ? (l) => { console.log(l); debugLogged = true; } : undefined);
                    currentBlock = "";
                    isCapture = false;
                } else {
                    // Either NOT a terminator, OR (Terminator but NO grade yet)
                    // Continue buffering to find the grade (maybe on this line, or next)
                    currentBlock += " " + cleanLine;
                }
            }
        }
    }
    // Flush last block
    if (currentBlock && isCapture) {
        processAwardBlock(currentBlock, grades, !debugLogged ? (l) => { console.log(l); debugLogged = true; } : undefined);
    }

    return {
        candidateName,
        uci,
        dob,
        grades,
        rawText: text.substring(0, 300)
    };
};

const processAwardBlock = (block: string, grades: ExtractedGrade[], logger?: (msg: string) => void) => {
    if (logger) logger(`[DEBUG] Processing Block: "${block}"`);

    // 1. Strict Filters
    if (!block.toUpperCase().includes("AWARD")) return;

    // Grade Regex: B(b) -> Capture purely based on patterns
    // Must use strict: ([A-Z])\([a-z]\)
    const gradeMatch = block.match(/([A-Z])\([a-z]\)/);
    if (!gradeMatch) {
        if (logger) logger(`[DEBUG] No grade match found in block.`);
        return;
    }

    // Marks Regex: 225/300
    const marksMatch = block.match(/(\d+)\s*\/\s*(\d+)/);
    if (!marksMatch) {
        if (logger) logger(`[DEBUG] No marks match found in block.`);
        return;
    }

    // 2. Extraction
    const awardIndex = block.toUpperCase().indexOf("AWARD");
    const content = block.substring(awardIndex + 5).trim();

    // Code Regex: XAC11 etc.
    const codeRegex = /\b(X[A-Z]{2}\d{2})\b/;
    const codeMatch = content.match(codeRegex);

    if (!codeMatch) return;
    const code = codeMatch[1];
    const grade = gradeMatch[1]; // Capital letter

    // Subject Extraction: Between Code limit and Marks start
    const codeIdx = content.indexOf(code);
    const marksIdx = content.indexOf(marksMatch[0]); // Using full marks match string

    if (marksIdx <= codeIdx + code.length) {
        if (logger) logger(`[DEBUG] Marks appear before/in Code? Parsing error.`);
        return;
    }

    let subject = content.substring(codeIdx + code.length, marksIdx).trim();
    // Clean subject
    subject = subject.replace(/[^A-Za-z\s\-&]/g, "").trim();

    if (code && subject && grade) {
        grades.push({ code, subject, grade });
    }
};

const parseTextLocally = (text: string): StudentResult[] => {
    const normalized = normalizeText(text);
    const markedText = normalized
        .replace(/CANDIDATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME/gi, "|||BLOCK_START|||CANDIDATE NAME");

    let chunks = markedText.split('|||BLOCK_START|||');
    chunks = chunks.filter(c => c.length > 50);

    if (chunks.length === 0 && normalized.length > 50) {
        chunks = [normalized];
    }

    const results: StudentResult[] = [];
    for (const chunk of chunks) {
        const res = parseStudentBlock(chunk);
        if (res.candidateName && res.candidateName !== 'Unknown Candidate') {
            results.push(res);
        }
    }
    return results;
};

// --- PDF Extraction (Server Side) ---

const extractTextFromPdfBuffer = async (buffer: Buffer, gcsUri?: string): Promise<string> => {
    try {
        const data = await pdf(buffer);
        // pdf-parse provides the full raw text in data.text
        if (data.text && data.text.trim().length > 100) {
            return data.text;
        }
    } catch (err: any) {
        console.warn("[API] pdf-parse failed or empty, trying OCR strategy...", err.message);
    }

    // fallback to Google Vision OCR if text is empty or failed
    if (gcsUri) {
        return await extractTextWithOCR(gcsUri);
    }

    return "";
};

// --- Google Vision OCR Integration ---
import { ImageAnnotatorClient } from '@google-cloud/vision';

const extractTextWithOCR = async (gcsUri: string): Promise<string> => {
    console.log(`[API] Triggering Google Vision OCR for ${gcsUri}`);

    // We already have admin initialized, but Vision client needs its own credential config
    // We can reuse the env vars
    const client = new ImageAnnotatorClient({
        credentials: {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            project_id: process.env.FIREBASE_PROJECT_ID
        }
    });

    try {
        // Use async batch annotation for PDF files in GCS
        // This is a long-running operation, but for 1-5 pages it might be acceptable?
        // Actually, asyncBatchAnnotateFiles returns an Operation that we must poll.
        // For a synchronous API, this is risky.
        // However, there is no synchronous PDF text detection API that takes GCS URI.
        // We must do async + polling.

        const outputUri = `gs://${process.env.FIREBASE_STORAGE_BUCKET}/ocr_results/${Date.now()}_`;

        const request = {
            requests: [
                {
                    inputConfig: {
                        gcsSource: { uri: gcsUri },
                        mimeType: 'application/pdf',
                    },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                    outputConfig: {
                        gcsDestination: { uri: outputUri },
                        batchSize: 5 // process up to 5 pages per chunk
                    },
                },
            ],
        };

        const [operation] = await client.asyncBatchAnnotateFiles(request as any);
        console.log(`[API] OCR Operation started: ${operation.name}`);

        const [filesResponse] = await operation.promise();
        console.log(`[API] OCR Operation completed.`);

        // Now read the output json(s) from GCS
        // outputUri prefix + "output-1-to-X.json"

        const bucket = admin.storage().bucket();
        // List files with prefix
        const [files] = await bucket.getFiles({ prefix: `ocr_results/${outputUri.split('/').pop()}` });

        let fullText = "";

        for (const file of files) {
            if (file.name.endsWith('.json')) {
                const [content] = await file.download();
                const response = JSON.parse(content.toString());
                // response.responses[i].fullTextAnnotation.text
                if (response.responses) {
                    for (const res of response.responses) {
                        if (res.fullTextAnnotation) {
                            fullText += res.fullTextAnnotation.text + "\n";
                        }
                    }
                }
            }
            // Cleanup temp file
            await file.delete().catch(() => { });
        }

        return fullText;

    } catch (error: any) {
        console.error("[API] Google Vision OCR failed:", error);
        return "";
    }
};

// --- API Handler ---

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { filePath } = req.body; // e.g., "superadmin_documents/June 2021/RESULTS..."

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        console.log(`[API] Extracting for path: ${filePath}`);

        // 1. Download file from Firebase Storage
        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        const [exists] = await file.exists();
        if (!exists) {
            console.error(`[API] File not found: ${filePath}`);
            return res.status(404).json({ error: 'File not found in storage' });
        }

        const [buffer] = await file.download();
        console.log(`[API] Downloaded ${buffer.length} bytes`);

        // 2. Extract Text
        let text = '';
        try {
            if (filePath.toLowerCase().endsWith('.pdf')) {
                // Construct GCS URI: gs://<bucket>/<filePath>
                const gcsUri = `gs://${bucket.name}/${filePath}`;
                text = await extractTextFromPdfBuffer(buffer, gcsUri);
            } else {
                // Determine if we need other handlers?
                // For now, assume PDF only per requirement
                throw new Error("Unsupported file type for server-side extraction (only PDF currently)");
            }
        } catch (extractError: any) {
            console.error("[API] Text Extraction Failed", extractError);
            return res.status(500).json({ error: 'Text extraction failed', details: extractError.message });
        }

        // 3. Parse Logic
        const results = parseTextLocally(text);

        console.log(`[API] PDF loaded successfully`);
        console.log(`[API] Extracted text length: ${text.length}`);

        if (!text.trim()) {
            console.log("[API] PDF has no text layer");
        }

        if (results.length > 0) {
            console.log(`[API] Candidate found: ${results[0].candidateName}`);
        } else {
            console.log(`[API] No candidates found in text.`);
        }
        console.log(`[API] Extracted ${results.length} candidates`);

        return res.status(200).json({
            success: true,
            students: results,
            debug: { length: text.length, snippet: text.substring(0, 100) }
        });

    } catch (error: any) {
        console.error("[API] Fatal Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
