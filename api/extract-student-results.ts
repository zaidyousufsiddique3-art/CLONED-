
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
        .replace(/C\s+A\s+N\s+D\s+I\s+D\s+A\s+T\s+E/gi, "CANDIDATE")
        .replace(/CAND[1lI]DATE/gi, "CANDIDATE")
        .replace(/UN[1lI]QUE/gi, "UNIQUE")
        .replace(/NO\. AND/gi, "NO. AND")
        .replace(/N\s+O/gi, "NO")
        .replace(/N\s+A\s+M\s+E/gi, "NAME")
        .replace(/A\s+N\s+D/gi, "AND")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n');
    return normalized;
};
const parseStudentBlock = (text: string): StudentResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let candidateName = '';
    let uci = '';
    let dob = '';
    const grades: ExtractedGrade[] = [];

    // Enhanced regex to capture full name including colons and spaces
    // Looks for CANDIDATE NAME <optional ID> <NAME>
    const candidateNameRegex = /CANDIDATE\s+NAME\s*(?:[:.]|)?\s*(?:(\d{4}))?\s*(?:[:.]|)?\s*([A-Z\s\.\-:]+)/i;
    let nameMatch = text.match(candidateNameRegex);

    if (nameMatch) {
        let rawName = nameMatch[2].trim();
        const stopMarkers = ['UNIQUE', 'DATE OF BIRTH', 'CENTRE', 'Result'];
        for (const marker of stopMarkers) {
            const idx = rawName.toUpperCase().indexOf(marker);
            if (idx !== -1) {
                rawName = rawName.substring(0, idx);
            }
        }
        candidateName = rawName.trim();
    }

    if (!candidateName) {
        const nameLine = lines.find(l => /CANDIDATE\s+(?:NO\.|NUMBER)?\s*(?:AND)?\s*NAME/i.test(l));
        if (nameLine) {
            let cleaned = nameLine.replace(/CANDIDATE\s+(?:NO\.|NUMBER)?\s*(?:AND)?\s*NAME/i, '').trim();
            cleaned = cleaned.replace(/^\d{4}\s*/, '');
            cleaned = cleaned.replace(/^[:\-\.]+\s*/, '');
            candidateName = cleaned;
        }
    }

    const uciMatch = text.match(/UNIQUE\s+CANDIDATE\s+IDENTIFIER\s*[:\.]?\s*([A-Z0-9]+)/i);
    if (uciMatch) uci = uciMatch[1];
    else {
        const uciPattern = /\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/;
        const deepMatch = text.match(uciPattern);
        if (deepMatch) uci = deepMatch[0];
    }

    const dobMatch = text.match(/DATE\s+OF\s+BIRTH\s*[:\.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    if (dobMatch) dob = dobMatch[1];
    else {
        const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
        if (dateMatch) dob = dateMatch[0];
    }

    // --- OCR NORMALIZATION & BLOCK RECONSTRUCTION ---

    // 1. Normalize OCR Text GLOBALLY before splitting
    // Fix spaced capitals: "A W A R D" -> "AWARD"
    // Fix spaces between single capital letters: "X A C 1 1" -> "XAC11"

    // Strategy:
    // a. Replace "A W A R D" specific patterns first (most critical)
    // b. General collapsing of single chars? Matches like /([A-Z])\s+([A-Z])/g

    let normalizedBody = text;

    // Specific fix for "A W A R D" (case insensitive)
    normalizedBody = normalizedBody.replace(/A\s+W\s+A\s+R\s+D/gi, "AWARD");
    // Fix "AW ARD", "A WARD" etc
    normalizedBody = normalizedBody.replace(/AW\s+ARD/gi, "AWARD");
    normalizedBody = normalizedBody.replace(/A\s+WARD/gi, "AWARD");
    normalizedBody = normalizedBody.replace(/AWA\s+RD/gi, "AWARD");

    // General fix: Collapse spaces between capital letters (e.g. S U B J E C T -> SUBJECT)
    // Be careful not to merge subject words if they are genuinely spaced.
    // However, user requirement says "Remove spaces between single capital letters globally".
    // This implies "X A C 1 1" -> "XAC11" but maybe "A C C O U N T I N G" -> "ACCOUNTING"
    // Regex: look for [A-Z] space [A-Z], repeatedly.
    // Safe approach: /(?<=^[A-Z]|\s[A-Z])\s+(?=[A-Z])/g ?? 
    // Simpler: Replace " <Char> " sequences?
    // Let's protect "AWARD" first (done).

    // Let's follow the user's explicit examples:
    // "A W A R D" -> "AWARD"
    // "Remove spaces between single capital letters globally"
    // Implementation: Try to find isolated single chars separated by space.
    // Regex: / \b([A-Z])\s+(?=[A-Z]\b) /g

    normalizedBody = normalizedBody.replace(/\b([A-Z])\s+(?=[A-Z]\b)/g, "$1");
    // Run it again to handle overlap "A B C" -> "AB C" -> "ABC"
    normalizedBody = normalizedBody.replace(/\b([A-Z0-9])\s+(?=[A-Z0-9]\b)/g, "$1"); // Include digits for XAC11

    // Collapse multiple spaces
    normalizedBody = normalizedBody.replace(/[ \t]+/g, ' ');

    const normalizedLines = normalizedBody.split('\n').map(l => l.trim());

    const reconstructedRows: string[] = [];
    let currentBuffer = "";
    let emptyLineCount = 0;

    for (const line of normalizedLines) {
        if (!line) {
            emptyLineCount++;
            if (emptyLineCount > 2) {
                if (currentBuffer) {
                    reconstructedRows.push(currentBuffer);
                    currentBuffer = "";
                }
            }
            continue;
        }
        emptyLineCount = 0;

        // 2. Flexible AWARD Detection
        // normalized text already fixed spaced "A W A R D" -> "AWARD"
        if (line.toUpperCase().includes("AWARD")) {
            if (currentBuffer) {
                reconstructedRows.push(currentBuffer);
            }
            currentBuffer = line;
        } else {
            if (currentBuffer) {
                currentBuffer += " " + line;
            }
        }
    }
    if (currentBuffer) {
        reconstructedRows.push(currentBuffer);
    }

    // 4. REGEX ON BLOCKS ONLY
    for (const row of reconstructedRows) {
        const normalizedRow = row.replace(/\s+/g, ' ').trim();
        const upperRow = normalizedRow.toUpperCase();

        if (!upperRow.includes("AWARD")) continue;
        if (upperRow.startsWith("UNIT") || /^\s*UNIT\b/i.test(normalizedRow)) continue;

        // STRICT FILTER: Marks (num/num)
        const marksMatch = normalizedRow.match(/(\d+\s*\/\s*\d+)/);
        if (!marksMatch) continue;

        // STRICT FILTER: Grade [A-Z]([a-z])
        const gradeMatch = normalizedRow.match(/([A-Z])\(([a-z])\)/);
        if (!gradeMatch) continue;

        const gradeLetter = gradeMatch[1]; // A from A(a)

        // 5. SUBJECT EXTRACTION
        // Between Code (Token 1) and Marks
        // AWARD <Code> <Subject> <Marks>

        const awardIdx = upperRow.indexOf("AWARD");
        const afterAward = normalizedRow.substring(awardIdx + 5).trim();
        const parts = afterAward.split(" ");
        if (parts.length < 1) continue;

        const code = parts[0];

        // Find Marks start index in 'afterAward'
        const marksStr = marksMatch[0];
        // Be careful: find marksStr AFTER the code
        // indexOf might find marks inside code if code was "100/200" (unlikely)
        // Let's search from (code.length)
        const marksStartIdx = afterAward.indexOf(marksStr, code.length);

        if (marksStartIdx < 0) continue;

        let subject = afterAward.substring(code.length, marksStartIdx).trim();

        // Cleaning
        // Remove subject codes if present (user requirement: "XAC11") - already skipped as it is parts[0]
        // Remove known noise chars
        subject = subject.replace(/[^A-Za-z0-9\s\&\-\(\)]/g, '').trim();

        if (code && subject && gradeLetter) {
            grades.push({
                code,
                subject,
                grade: gradeLetter
            });
        }
    }

    return {
        candidateName: candidateName || 'Unknown Candidate',
        uci: uci || 'Unknown UCI',
        dob: dob || 'Unknown DOB',
        grades,
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
