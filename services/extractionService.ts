
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
 * Main function to get data. 
 * Checks Cache -> Extracts Text -> Calls AI (or Local Regex Fallback) -> Saves Cache.
 */
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

    // 2. Extract Text locally (with OCR fallback for scanned PDFs)
    let text = '';
    try {
        if (file.type === 'application/pdf') {
            text = await extractTextFromPdf(file);
        } else if (file.type.startsWith('image/')) {
            text = await extractTextFromImage(file);
        } else {
            console.warn('Unsupported file type:', file.type);
            return [];
        }
    } catch (err) {
        console.error('Error extracting text:', err);
        return [];
    }

    // 3. Try AI API
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
            fileName: file.name
        });

        return results;

    } catch (err) {
        console.warn("AI Analysis failed or not available locally. Falling back to local regex extraction.", err);

        // 4. FALLBACK: Local Regex Parsing
        // This ensures it works locally without Vercel functions running
        const localResults = parseTextLocally(text);

        if (localResults.length > 0) {
            // We can optionally cache this too, but maybe tag it as 'local'
            try {
                await setDoc(cacheRef, {
                    results: localResults,
                    updatedAt: new Date().toISOString(),
                    fileName: file.name,
                    method: 'local_fallback'
                });
            } catch (e) { console.warn("Cache save failed", e); }
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

        // Try text content first
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');

        // Heuristic: If page text is very short (e.g. < 50 chars), it might be a scanned image.
        // We need to render it and OCR it.
        if (pageText.length < 50) {
            console.log(`Page ${i} seems to be scanned (text len ${pageText.length}). Running OCR...`);
            try {
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const worker = await createWorker('eng');
                    const ret = await worker.recognize(canvas);
                    await worker.terminate();
                    fullText += ret.data.text + '\n';
                    continue; // Skip appending the empty pageText
                }
            } catch (ocrErr) {
                console.error(`OCR failed for page ${i}`, ocrErr);
            }
        }

        fullText += pageText + '\n';
    }
    return fullText;
};

// --- Local Parsing Logic (Client-Side Fallback) ---

const parseTextLocally = (text: string): StudentResult[] => {
    // Legacy Regex Logic from previous step as fallback
    // Normalize
    let normalizedText = text
        .replace(/CAND[1lI]DATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME/gi, "CANDIDATE NAME_MARKER")
        .replace(/CANDIDATE NO\. AND NAME/gi, "CANDIDATE NAME_MARKER")
        .replace(/CANDIDATE NAME/gi, "CANDIDATE NAME_MARKER")
        .replace(/UN[1lI]QUE CAND[1lI]DATE IDENTIFIER/gi, "UNIQUE CANDIDATE IDENTIFIER")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH");

    const splitRegex = /(?=CANDIDATE NAME_MARKER)/i;
    let chunks = normalizedText.split(splitRegex);
    chunks = chunks.filter(c => c.trim().length > 100);

    if (chunks.length === 0 && text.length > 50) {
        chunks = [text];
    }

    const results: StudentResult[] = [];

    for (const block of chunks) {
        const res = parseStudentBlock(block);
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

    // Name
    // Relaxed regex to catch "CANDIDATE NAME_MARKER" then Name
    const nameRegex = /CANDIDATE NAME_MARKER\s*(?:[:.]|)?\s*(\d{4})?\s*(?:[:.]|)?\s*([A-Z\s\.:-]+)/i;
    let matchName = text.match(nameRegex);
    if (!matchName) {
        const rawNameRegex = /CAND[1lI]DATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME\s*(?:[:.]|)?\s*(\d{4})?\s*(?:[:.]|)?\s*([A-Z\s\.:-]+)/i;
        matchName = text.match(rawNameRegex);
    }
    if (matchName) {
        let rawName = (matchName[2] || '').trim();
        const digitMatch = rawName.match(/^(\d{4})\s+(.+)/);
        if (digitMatch) rawName = digitMatch[2];

        ['DATE OF BIRTH', 'UNIQUE CANDIDATE IDENTIFIER', 'CENTRE'].forEach(sw => {
            const idx = rawName.toUpperCase().indexOf(sw);
            if (idx !== -1) rawName = rawName.substring(0, idx);
        });
        candidateName = rawName.trim();
    }

    // DOB
    const dobRegex = /DATE OF BIRTH\s*[:.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i;
    const matchDob = text.match(dobRegex);
    if (matchDob) dob = matchDob[1];
    else {
        const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
        if (dateMatch) dob = dateMatch[0];
    }

    // UCI
    const uciRegex = /UNIQUE CANDIDATE IDENTIFIER\s*[:.]?\s*([A-Z0-9]+)/i;
    const matchUci = text.match(uciRegex);
    if (matchUci) uci = matchUci[1];
    else {
        const uciPattern = /\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/;
        const deepMatch = text.match(uciPattern);
        if (deepMatch) uci = deepMatch[0];
    }

    // Grades
    for (const line of lines) {
        if (line.startsWith('AWARD')) {
            const content = line.substring(5).trim();
            const parts = content.split(/\s+/);
            if (parts.length >= 2) {
                const code = parts[0];
                let grade = '';
                let subjectEndIndex = -1;
                for (let i = parts.length - 1; i >= 1; i--) {
                    const p = parts[i];
                    if (/^[A-E,U]\*?(\([a-z]\))?$/.test(p) || p === 'A*') {
                        grade = p;
                        subjectEndIndex = i;
                        break;
                    }
                }
                if (grade && subjectEndIndex > 0) {
                    const rawSubjectParts = parts.slice(1, subjectEndIndex);
                    const subjectParts = rawSubjectParts.filter(p => !/^[\d\/]+$/.test(p));
                    const subject = subjectParts.join(' ');
                    if (subject) grades.push({ code, subject, grade });
                }
            }
        }
    }

    return {
        candidateName: candidateName || 'Unknown Candidate',
        uci: uci || 'Unknown UCI',
        dob: dob || 'Unknown DOB',
        grades,
        rawText: text.substring(0, 500)
    };
};
