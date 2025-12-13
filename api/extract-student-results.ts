
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

    const candidateNameRegex = /CANDIDATE\s+NAME\s*(?:[:.]|)?\s*(?:(\d{4}))?\s*(?:[:.]|)?\s*([A-Z\s\.\-]+)/i;
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

    for (const line of lines) {
        // STRICT FILTER: Match rows starting with "AWARD" (case-insensitive)
        if (!line.trim().toUpperCase().startsWith('AWARD')) continue;

        // STRICT FILTER: Ignore headers, units, or contributing components
        // The user explicitly listed "UNIT", "Contributing Units" as INVALID.
        // Also headers like "CANDIDATE..." shouldn't be here due to logic above, but safety check.
        if (/^UNIT\b/i.test(line)) continue;

        // STRICT LOGIC: Must contain a grade in format A(a), B(b), etc.
        // Regex: [A-Z]\([a-z]\) at the end of the line or near the end
        // Also marks: usually 123/456
        const gradeMatch = line.match(/([A-Z])\(([a-z])\)/);
        if (!gradeMatch) continue; // Skip if no valid grade format found

        // Extract parts
        // Expected format: AWARD <code> <Subject Name> <Marks> <Grade>
        // Example: AWARD XAC11 ACCOUNTING 225/300 B(b)

        const content = line.substring(5).trim(); // Remove AWARD
        const parts = content.split(/\s+/);

        let code = parts[0];
        let grade = gradeMatch[0];
        let subject = "";

        // Find matches for Grade and Marks to isolate Subject
        // We know Grade is at the end or near end.

        // Let's rely on the structure: Code is first part. Grade is last part usually?
        // Sometimes Grade is followed by points or nothing.
        // Let's look for the grade index in parts

        let gradeIndex = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].includes(gradeMatch[0])) {
                gradeIndex = i;
                break;
            }
        }

        if (gradeIndex <= 0) continue; // Should have code and subject before grade

        // Extracted Grade is parts[gradeIndex]
        // But pure grade letter might be just the first char of "B(b)" -> "B"
        // User output example showed "grade": "B". Input was "B(b)".
        // So we extract the uppercase letter.
        grade = gradeMatch[1];

        // Marks usually precedes grade. E.g. 225/300
        // But strictly, subject is everything between Code and Marks/Grade.

        // Let's filter out marks if they exist
        const isMarks = (s: string) => /^\d+\/\d+$/.test(s) || /^\d+$/.test(s);

        let subjectEndIndex = gradeIndex;
        // Check if the part before grade is marks
        if (gradeIndex > 1 && isMarks(parts[gradeIndex - 1])) {
            subjectEndIndex = gradeIndex - 1;
        }

        const subjectParts = parts.slice(1, subjectEndIndex);
        subject = subjectParts.join(' ');

        // Clean Subject
        // Remove ANY trailing numbers or odd chars if they leaked
        subject = subject.replace(/[\d\/]+$/, '').trim();

        if (code && subject && grade) {
            grades.push({ code, subject, grade });
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
