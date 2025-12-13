import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { db } from '../firebase/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export interface ExtractedGrade {
    code?: string;
    subject: string;
    grade: string;
}

export interface StudentResult {
    candidateName: string;
    uci: string;
    dob: string;
    results: ExtractedGrade[];
    rawText?: string;
}

/**
 * Normalizes text to handle OCR quirks and layout issues.
 */
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

    return normalized;
};


export const extractDataFromFile = async (file: File, fileId: string): Promise<StudentResult[]> => {
    const safeId = fileId.replace(/[^a-zA-Z0-9]/g, '_');
    const cacheRef = doc(db, 'extracted_results', safeId);

    // 1. Check Cache
    // Bypass cache if user probably wants fresh debug (optional, but let's keep it simple for now)
    try {
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
            console.log(`[DEBUG] Cache hit for ${file.name}`);
            return cacheSnap.data().results as StudentResult[];
        }
    } catch (err) {
        console.warn("Cache check failed", err);
    }

    // 2. Extract Text locally (with OCR fallback)
    let text = '';
    let extractionMethod = 'text';

    try {
        if (file.type === 'application/pdf') {
            text = await extractTextFromPdf(file);
        } else if (file.type.startsWith('image/')) {
            text = await extractTextFromImage(file);
            extractionMethod = 'ocr';
        } else {
            console.warn('Unsupported file type:', file.type);
            return [];
        }

        // Log extraction status
        console.log(`[DEBUG] Extracted ${text.length} chars from ${file.name} using ${extractionMethod}`);
        console.log(`[DEBUG] First 500 chars snippet:\n${text.substring(0, 500)}`);

        if (text.length < 100) {
            console.warn(`[DEBUG] Extraction yielded very little text (${text.length} chars). Possible failure.`);
        }

    } catch (err) {
        console.error('Error extracting text:', err);
        return [];
    }

    // 3. Try AI API -> Fallback to Local immediately if failure
    try {
        console.log(`[DEBUG] Sending ${text.length} chars to AI analysis...`);
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.students || [];

        // Save to Cache
        await setDoc(cacheRef, {
            results,
            updatedAt: new Date().toISOString(),
            fileName: file.name,
            method: 'ai'
        });

        return results;

    } catch (err) {
        console.warn("[DEBUG] AI Analysis failed. Falling back to local/client-side parsing.", err);

        // 4. FALLBACK: Robust Client-Side Parsing
        const localResults = parseTextLocally(text);

        if (localResults.length > 0) {
            console.log(`[DEBUG] Local Fallback found ${localResults.length} candidates.`);
            try {
                await setDoc(cacheRef, {
                    results: localResults,
                    updatedAt: new Date().toISOString(),
                    fileName: file.name,
                    method: 'local_fallback'
                });
            } catch (e) { console.warn("Cache save failed", e); }
        } else {
            console.error("[DEBUG] Local parsing also returned no results. Dumping snippet:", text.substring(0, 300));
        }

        return localResults;
    }
};

const extractTextFromImage = async (file: File): Promise<string> => {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(file);
    await worker.terminate();
    return ret.data.text;
};

const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText = textContent.items.map((item: any) => item.str).join(' ');

        // If very little text, render and OCR
        if (pageText.trim().length < 50) {
            console.log(`[DEBUG] Page ${i} seems to be scanned (text len ${pageText.length}). Running OCR with high scale...`);
            try {
                // Determine scale based on viewport size to ensure good OCR resolution
                // A4 is roughly 595x842. We want nice big text for Tesseract.
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    const renderContext: any = { canvasContext: context, viewport: viewport };
                    await page.render(renderContext).promise;

                    // Verify canvas has data by checking a few pixels? 
                    // Or just run OCR.
                    const worker = await createWorker('eng');
                    const ret = await worker.recognize(canvas);
                    await worker.terminate();

                    console.log(`[DEBUG] OCR Result Page ${i}: ${ret.data.text.length} chars`);
                    pageText = ret.data.text;
                }
            } catch (ocrErr) {
                console.error(`OCR failed for page ${i}`, ocrErr);
            }
        }

        fullText += pageText + '\n ';
    }
    return fullText;
};

// --- Local Parsing Logic ---

const parseTextLocally = (text: string): StudentResult[] => {
    // 1. Normalize
    const normalized = normalizeText(text);

    // 2. Identify Blocks by repeated headers
    // We look for "CANDIDATE NAME" or similar anchors
    // If strict markers fail, we treat the whole things as one block

    // Regex for start of block: "CANDIDATE ... NAME"
    // We replace it with a unique token to split easily
    const markedText = normalized
        .replace(/CANDIDATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME/gi, "|||BLOCK_START|||CANDIDATE NAME");

    let chunks = markedText.split('|||BLOCK_START|||');

    // Filter noise
    chunks = chunks.filter(c => c.length > 50);

    // Fallback if no split happened (single page) but text exists
    if (chunks.length === 0 && normalized.length > 50) {
        chunks = [normalized];
    }

    console.log(`[DEBUG] Split into ${chunks.length} student blocks`);

    const results: StudentResult[] = [];

    for (const chunk of chunks) {
        const res = parseStudentBlock(chunk);
        // Important: Return result if Name is found, even if partial
        if (res.candidateName && res.candidateName !== 'Unknown Candidate') {
            results.push(res);
        }
    }

    return results;
};

// Return result OR null (Functional approach)
const processAwardBlock = (block: string): ExtractedGrade | null => {
    // 1. Strict Filters
    if (!block.toUpperCase().includes("AWARD")) return null;

    // 2. Grade Regex (MATCH BEFORE TRIMMING/ SPLITTING)
    // CAPTURE GROUP 1: The official Pearson Grade (including optional *)
    const gradeRegex = /([A-EU]\*?)\s*\(\s*([a-eu]\*?)\s*\)/;

    // We run matches on the full block string
    const gradeMatch = block.match(gradeRegex);
    if (!gradeMatch) return null;

    const grade = gradeMatch[1]; // A, B, U... capture group 1

    // 4. Code Regex (RELAXED AS REQUESTED)
    const codeRegex = /([XYW][A-Z]{2}\d{2})/i;
    const codeMatch = block.match(codeRegex);

    if (!codeMatch) return null;

    const code = codeMatch[1]; // Capture group 1

    // 5. Subject Extraction
    const content = block;
    const codeIdx = content.indexOf(code);

    // Safety check
    if (codeIdx === -1) return null;

    const marksRegex = /\b\d+\s*\/\s*\d+\b/;
    const marksMatch = block.match(marksRegex);

    let subjectEndIdx = -1;

    if (marksMatch) {
        subjectEndIdx = content.indexOf(marksMatch[0]);
    } else {
        subjectEndIdx = gradeMatch.index!;
    }

    if (marksMatch && subjectEndIdx <= codeIdx + code.length) {
        subjectEndIdx = gradeMatch.index!;
    }

    if (subjectEndIdx <= codeIdx + code.length) {
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
        return { code, subject, grade };
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
    const results: ExtractedGrade[] = [];

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

    return {
        candidateName,
        uci,
        dob,
        results,
        rawText: text.substring(0, 300)
    };
};
