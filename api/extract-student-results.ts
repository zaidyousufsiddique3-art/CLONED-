import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { createRateLimiter, getClientIp } from '../lib/rateLimit';

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
    results: ExtractedGrade[]; // Renamed from grades to results per strict requirement
    rawText?: string;
}

// --- Parsing Logic ---

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

        // Fix Subject Codes like "X A C 1 1" -> "XAC11" (Support X, Y, W)
        .replace(/\b([XYW])\s*([A-Z])\s*([A-Z])\s*(\d)\s*(\d)\b/g, "$1$2$3$4")

        // Force Newline ONLY before keywords to ensure they start lines.
        // Also ensure SPACE after AWARD to split 'AWARDYCH11' -> 'AWARD YCH11' for regex safety
        .replace(/AWARD/gi, '\nAWARD ')
        .replace(/UNIT/gi, '\nUNIT ')
        .replace(/Contributing/gi, '\nContributing ')

        // General whitespace collapse
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n');

    // --- HARD DEBUG SIGNALS ---
    console.log("[DEBUG] NORMALIZATION COMPLETE");
    console.log("[DEBUG] textLen:", normalized.length);
    console.log("[DEBUG] awardCount:", (normalized.match(/\bAWARD\b/gi) || []).length);

    // Debug specific grade token count
    const gradeRegexGlobal = /([A-EU])\*?\s*\(\s*([a-eu])\*?\s*\)/g;
    const gradeCount = (normalized.match(gradeRegexGlobal) || []).length;

    console.log("[DEBUG] gradeTokenCount (Strict):", gradeCount);
    console.log("[DEBUG] sampleText:", normalized.slice(0, 800));
    // ----------------------------

    return normalized;
};

// Return result OR null (Functional approach)
const processAwardBlock = (block: string): ExtractedGrade | null => {
    console.log(`[DEBUG] Processing Block: "${block}"`);

    // 1. Strict Filters
    if (!block.toUpperCase().includes("AWARD")) return null;

    // 2. Grade Regex (MATCH BEFORE TRIMMING/ SPLITTING)
    // CAPTURE GROUP 1: The official Pearson Grade (including optional *)
    const gradeRegex = /([A-EU]\*?)\s*\(\s*([a-eu]\*?)\s*\)/;

    // We run matches on the full block string
    const gradeMatch = block.match(gradeRegex);
    if (!gradeMatch) {
        console.log(`[DEBUG] No grade match in block: "${block}"`);
        return null;
    }
    const grade = gradeMatch[1]; // A, B, U... capture group 1

    // 4. Code Regex (RELAXED AS REQUESTED)
    const codeRegex = /([XYW][A-Z]{2}\d{2})/i;
    const codeMatch = block.match(codeRegex);
    console.log("[DEBUG] codeMatch:", codeMatch);

    if (!codeMatch) {
        console.log(`[DEBUG] No code match in block: "${block}"`);
        return null;
    }
    const code = codeMatch[1]; // Capture group 1

    // 5. Subject Extraction
    const content = block;
    const codeIdx = content.indexOf(code);

    // Safety check just in case indexOf fails or behaves weirdly with overlapping matches
    if (codeIdx === -1) {
        return null;
    }

    const marksRegex = /\b\d+\s*\/\s*\d+\b/;
    const marksMatch = block.match(marksRegex);

    let subjectEndIdx = -1;

    if (marksMatch) {
        subjectEndIdx = content.indexOf(marksMatch[0]);
    } else {
        subjectEndIdx = gradeMatch.index!;
    }

    if (marksMatch && subjectEndIdx <= codeIdx + code.length) {
        console.log(`[DEBUG] Marks boundary weird, falling back to grade boundary: "${block}"`);
        subjectEndIdx = gradeMatch.index!;
    }

    if (subjectEndIdx <= codeIdx + code.length) {
        console.log(`[DEBUG] Subject boundary invalid (Code overlaps end): "${block}"`);
        if (gradeMatch.index! > codeIdx + code.length) {
            subjectEndIdx = gradeMatch.index!;
        } else {
            return null;
        }
    }

    let subject = content.substring(codeIdx + code.length, subjectEndIdx).trim();
    subject = subject.replace(/[^A-Za-z\s\-&]/g, "").trim();

    if (!subject) subject = "Unknown Subject";

    if (code && subject && grade) {
        const result = { code, subject, grade };
        console.log("[DEBUG] RETURNING RESULT:", result);
        return result;
    }
    return null;
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

    // 2. AWARD BUFFERING LOGIC
    const results: ExtractedGrade[] = []; // Named 'results'

    const gradeChecker = /([A-EU]\*?)\s*\(\s*([a-eu]\*?)\s*\)/;

    let currentBlock = "";
    let isCapture = false;

    const startsWithKeyword = (line: string, keyword: string) => {
        return line.toUpperCase().startsWith(keyword.toUpperCase());
    };

    const flushBlock = (block: string) => {
        if (!block) return;
        const res = processAwardBlock(block);
        if (res) {
            results.push(res);
        }
    };

    for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;

        if (startsWithKeyword(cleanLine, 'AWARD')) {
            if (currentBlock) flushBlock(currentBlock);
            currentBlock = cleanLine;
            isCapture = true;
        }
        else if (isCapture) {
            const hasGrade = gradeChecker.test(currentBlock);
            const isStopKeyword =
                startsWithKeyword(cleanLine, 'UNIT') ||
                startsWithKeyword(cleanLine, 'Contributing');

            const isNextStudent =
                cleanLine.includes("UNIQUE CANDIDATE") ||
                startsWithKeyword(cleanLine, 'CANDIDATE NAME');

            if (isNextStudent) {
                flushBlock(currentBlock);
                currentBlock = "";
                isCapture = false;
            }
            else if (hasGrade && isStopKeyword) {
                flushBlock(currentBlock);
                currentBlock = "";
                isCapture = false;
            }
            else {
                currentBlock += " " + cleanLine;
            }
        }
    }
    // Flush last
    if (currentBlock && isCapture) {
        flushBlock(currentBlock);
    }

    console.log("[DEBUG] FINAL RESULTS COUNT:", results.length);

    return {
        candidateName,
        uci,
        dob,
        results, // STRICT KEY NAME
        rawText: text.substring(0, 300)
    };
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

    const students: StudentResult[] = [];
    for (const chunk of chunks) {
        const res = parseStudentBlock(chunk);
        if (res.candidateName && res.candidateName !== 'Unknown Candidate') {
            students.push(res);
        }
    }
    return students;
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

    const client = new ImageAnnotatorClient({
        credentials: {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            project_id: process.env.FIREBASE_PROJECT_ID
        }
    });

    try {
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
                        batchSize: 5
                    },
                },
            ],
        };

        const [operation] = await client.asyncBatchAnnotateFiles(request as any);
        console.log(`[API] OCR Operation started: ${operation.name}`);

        await operation.promise();
        console.log(`[API] OCR Operation completed.`);

        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({ prefix: `ocr_results/${outputUri.split('/').pop()}` });

        let fullText = "";

        for (const file of files) {
            if (file.name.endsWith('.json')) {
                const [content] = await file.download();
                const response = JSON.parse(content.toString());
                if (response.responses) {
                    for (const res of response.responses) {
                        if (res.fullTextAnnotation) {
                            fullText += res.fullTextAnnotation.text + "\n";
                        }
                    }
                }
            }
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
    // RATE LIMITING (Extraction: 10 req / 5 min)
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
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { filePath } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        console.log(`[API] Extracting for path: ${filePath}`);

        const bucket = storage.bucket();
        const file = bucket.file(filePath);

        const [exists] = await file.exists();
        if (!exists) {
            console.error(`[API] File not found: ${filePath}`);
            return res.status(404).json({ error: 'File not found in storage' });
        }

        const [buffer] = await file.download();
        console.log(`[API] Downloaded ${buffer.length} bytes`);

        let text = '';
        try {
            if (filePath.toLowerCase().endsWith('.pdf')) {
                const gcsUri = `gs://${bucket.name}/${filePath}`;
                text = await extractTextFromPdfBuffer(buffer, gcsUri);
            } else {
                throw new Error("Unsupported file type for server-side extraction (only PDF currently)");
            }
        } catch (extractError: any) {
            console.error("[API] Text Extraction Failed", extractError);
            return res.status(500).json({ error: 'Text extraction failed', details: extractError.message });
        }

        const students = parseTextLocally(text);

        console.log(`[API] PDF loaded successfully`);
        console.log(`[API] Extracted text length: ${text.length}`);

        if (!text.trim()) {
            console.log("[API] PDF has no text layer");
        }

        if (students.length > 0) {
            console.log(`[API] Candidate found: ${students[0].candidateName}`);
            // FINAL RESPONSE CHECK
            console.log("[DEBUG] API RESPONSE SAMPLE (Results):", JSON.stringify(students[0].results, null, 2));
        } else {
            console.log(`[API] No candidates found in text.`);
        }
        console.log(`[API] Extracted ${students.length} candidates`);

        return res.status(200).json({
            success: true,
            students: students,
            debug: { length: text.length, snippet: text.substring(0, 100) }
        });

    } catch (error: any) {
        console.error("[API] Fatal Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
