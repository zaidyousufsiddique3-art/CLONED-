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
    grades: ExtractedGrade[];
    rawText?: string;
}

/**
 * Normalizes text to handle OCR quirks and layout issues.
 */
const normalizeText = (text: string): string => {
    if (!text) return '';

    let normalized = text
        // Replace widely spaced letters C A N D I D A T E -> CANDIDATE
        .replace(/C\s+A\s+N\s+D\s+I\s+D\s+A\s+T\s+E/gi, "CANDIDATE")
        // Fix common OCR errors
        .replace(/CAND[1lI]DATE/gi, "CANDIDATE")
        .replace(/UN[1lI]QUE/gi, "UNIQUE")
        .replace(/NO\. AND/gi, "NO. AND")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH")
        // Collapse multiple spaces
        .replace(/[ \t]+/g, ' ')
        // Ensure newlines are preserved but clean
        .replace(/\n\s+/g, '\n');

    return normalized;
};


export const extractDataFromFile = async (file: File, fileId: string): Promise<StudentResult[]> => {
    const safeId = fileId.replace(/[^a-zA-Z0-9]/g, '_');
    const cacheRef = doc(db, 'extracted_results', safeId);

    // 1. Check Cache
    try {
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
            console.log(`Cache hit for ${file.name}`);
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
        console.log(`Extracted ${text.length} chars from ${file.name} using ${extractionMethod}`);
        if (text.length < 100) {
            console.warn(`Extraction yielded very little text (${text.length} chars). Possible failure.`);
        }

    } catch (err) {
        console.error('Error extracting text:', err);
        return [];
    }

    // 3. Try AI API -> Fallback to Local immediately if failure
    try {
        console.log(`Sending ${text.length} chars to AI analysis...`);
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
        console.warn("AI Analysis failed. Falling back to local/client-side parsing.", err);

        // 4. FALLBACK: Robust Client-Side Parsing
        const localResults = parseTextLocally(text);

        if (localResults.length > 0) {
            try {
                await setDoc(cacheRef, {
                    results: localResults,
                    updatedAt: new Date().toISOString(),
                    fileName: file.name,
                    method: 'local_fallback'
                });
            } catch (e) { console.warn("Cache save failed", e); }
        } else {
            console.error("Local parsing also returned no results. Dumping snippet:", text.substring(0, 300));
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
            console.log(`Page ${i} seems to be scanned (text len ${pageText.length}). Running OCR with high scale...`);
            try {
                // Determine scale based on viewport size to ensure good OCR resolution
                // A4 is roughly 595x842. We want nice big text for Tesseract.
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    // Verify canvas has data
                    const worker = await createWorker('eng');
                    const ret = await worker.recognize(canvas);
                    await worker.terminate();

                    console.log(`OCR Result Page ${i}: ${ret.data.text.length} chars`);
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

const parseStudentBlock = (text: string): StudentResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let candidateName = '';
    let uci = '';
    let dob = '';
    const grades: ExtractedGrade[] = [];

    // --- Name Extraction ---
    // Strategy: Look for "CANDIDATE NAME" then capture text.
    // Handles:
    // 1. CANDIDATE NAME : JOHN DOE
    // 2. CANDIDATE NAME 0001 JOHN DOE
    // 3. CANDIDATE NAME \n JOHN DOE

    // Regex for "CANDIDATE NAME" followed by potential separators/numbers, then the name
    const candidateNameRegex = /CANDIDATE\s+NAME\s*(?:[:.]|)?\s*(?:(\d{4}))?\s*(?:[:.]|)?\s*([A-Z\s\.\-]+)/i;
    let nameMatch = text.match(candidateNameRegex);

    if (nameMatch) {
        // Group 2 is Name (unless empty). Note: Group 1 is Number if present.
        let rawName = nameMatch[2].trim();

        // If Name is empty or short, maybe it's on the next line?
        if (rawName.length < 2) {
            // Look at the text strictly following the match index?
            // Or iterate lines to find the line *after* CANDIDATE NAME
        }

        // Validation: Stop at Key Markers
        const stopMarkers = ['UNIQUE', 'DATE OF BIRTH', 'CENTRE', 'Result'];
        for (const marker of stopMarkers) {
            const idx = rawName.toUpperCase().indexOf(marker);
            if (idx !== -1) {
                rawName = rawName.substring(0, idx);
            }
        }

        candidateName = rawName.trim();
    }

    // If strict regex failed, try looking for the line starting with "CANDIDATE NAME" and taking the rest
    if (!candidateName) {
        const nameLine = lines.find(l => /CANDIDATE\s+(?:NO\.|NUMBER)?\s*(?:AND)?\s*NAME/i.test(l));
        if (nameLine) {
            // Remove the label
            let cleaned = nameLine.replace(/CANDIDATE\s+(?:NO\.|NUMBER)?\s*(?:AND)?\s*NAME/i, '').trim();
            // Remove leading digits (candidate number)
            cleaned = cleaned.replace(/^\d{4}\s*/, '');
            // Remove separators
            cleaned = cleaned.replace(/^[:\-\.]+\s*/, '');
            candidateName = cleaned;
        }
    }

    // --- UCI Extraction ---
    // Look for "UNIQUE CANDIDATE IDENTIFIER"
    const uciMatch = text.match(/UNIQUE\s+CANDIDATE\s+IDENTIFIER\s*[:\.]?\s*([A-Z0-9]+)/i);
    if (uciMatch) uci = uciMatch[1];
    else {
        // Fallback pattern
        const uciPattern = /\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/;
        const deepMatch = text.match(uciPattern);
        if (deepMatch) uci = deepMatch[0];
    }

    // --- DOB Extraction ---
    const dobMatch = text.match(/DATE\s+OF\s+BIRTH\s*[:\.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    if (dobMatch) dob = dobMatch[1];
    else {
        const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
        if (dateMatch) dob = dateMatch[0];
    }

    // --- Grades (Strict Award Only) ---
    // Start scanning when we see "AWARD" or "SUBJECT"
    // Stop when we see "UNIT" or end

    for (const line of lines) {
        // Must start with AWARD
        if (!line.toUpperCase().startsWith('AWARD')) continue;

        // Example: AWARD YMA01 MATHEMATICS 200/300 A(a)
        const content = line.substring(5).trim(); // remove AWARD
        const parts = content.split(/\s+/);

        if (parts.length < 2) continue;

        const code = parts[0];
        let grade = '';
        let subjectEndIndex = -1;

        // Find Grade from right side
        for (let i = parts.length - 1; i >= 1; i--) {
            const p = parts[i];
            // Format: A, A*, B(b), C(c), U
            if (/^[A-EU]\*?(\([a-z]\))?$/i.test(p)) {
                grade = p;
                subjectEndIndex = i;
                break;
            }
        }

        if (grade && subjectEndIndex > 0) {
            // Subject is everything between Code and Grade (excluding intermediate marks e.g. 200/300)
            const middleParts = parts.slice(1, subjectEndIndex);
            // Filter out numeric/scores
            const subjectParts = middleParts.filter(p => !/^[\d\/]+$/.test(p));
            const subject = subjectParts.join(' ');

            if (subject) {
                grades.push({ code, subject, grade });
            }
        }
    }

    return {
        candidateName: candidateName || 'Unknown Candidate',
        uci: uci || 'Unknown UCI',
        dob: dob || 'Unknown DOB',
        grades,
        rawText: text.substring(0, 300) // snippet for debug
    };
};
