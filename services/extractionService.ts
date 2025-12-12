
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

export interface ExtractedGrade {
    code: string;
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

export const extractDataFromFile = async (file: File): Promise<StudentResult[]> => {
    let text = '';

    try {
        if (file.type === 'application/pdf') {
            text = await extractTextFromPdf(file);
        } else if (file.type.startsWith('image/')) {
            text = await extractTextFromImage(file);
        } else {
            console.warn('Unsupported file type for extraction:', file.type);
            return [];
        }
    } catch (err) {
        console.error('Error reading file content:', err);
        return [];
    }

    // Debug: Log basic text length
    console.log(`Extracted ${text.length} chars from ${file.name}`);

    const studentBlocks = splitIntoStudentBlocks(text);
    const results: StudentResult[] = [];

    for (const block of studentBlocks) {
        const res = parseStudentBlock(block);
        // Be lenient: return separate result if at least name is found.
        if (res.candidateName && res.candidateName !== 'Unknown Candidate') {
            results.push(res);
        }
    }

    return results;
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
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        // use a marker less likely to interfere with "CANDIDATE NO. AND NAME"
        fullText += pageText + '\n ';
    }

    return fullText;
};

const splitIntoStudentBlocks = (text: string): string[] => {
    // Normalize header variations
    // Normalize header variations
    let normalizedText = text
        // Normalize fuzzy OCR or different PDF text flows for Candidate Name
        // Covers: "CANDIDATE NAME", "CANDIDATE No. AND NAME", "CANDIDATE NUMBER AND NAME", "CANDIDATE NO AND NAME"
        // Also handle potential case insensitivity and typos
        .replace(/CAND[1lI]DATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME/gi, "CANDIDATE NAME_MARKER")
        // Simplify for splitting if some variations were missed by regex above but hit exact phrases
        .replace(/CANDIDATE NO\. AND NAME/gi, "CANDIDATE NAME_MARKER")
        .replace(/CANDIDATE NAME/gi, "CANDIDATE NAME_MARKER");

    // Also normalize other fields while we are at it for parsing later
    normalizedText = normalizedText
        .replace(/UN[1lI]QUE CAND[1lI]DATE IDENTIFIER/gi, "UNIQUE CANDIDATE IDENTIFIER")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH");

    // Split by the simplified marker
    // Use capturing group to include delimiter if capturing, but here we just want to split.
    // We use lookahead `(?=...)` key to keep the marker at the start of the block.
    const splitRegex = /(?=CANDIDATE NAME_MARKER)/i;
    let chunks = normalizedText.split(splitRegex);

    // Filter out chunks that are too short to be a student record
    chunks = chunks.filter(c => c.trim().length > 100);

    // Fallback: If no markers found (chunks empty or just original text without marker), return the whole text as one block
    if (chunks.length === 0) {
        // Only if text looks substantial
        if (text.length > 50) return [text];
    }

    console.log(`Found ${chunks.length} student blocks`);
    return chunks;
};

const parseStudentBlock = (text: string): StudentResult => {
    // Clean newlines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let candidateName = '';
    let uci = '';
    let dob = '';
    const grades: ExtractedGrade[] = [];

    // --- Regex Definitions ---

    // Name: "CANDIDATE NAME_MARKER" [optional no] [NAME]
    // Example 1: CANDIDATE NAME_MARKER 0001 JOHN DOE
    // Example 2: CANDIDATE NAME_MARKER JOHN DOE (if no number)
    // Example 3: CANDIDATE NAME_MARKER 1234 : JOHN DOE (with separator)
    // We want to capture [NAME]. Name is usually uppercase letters, spaces, maybe colon.
    // Note: the `splitIntoStudentBlocks` replaced original label with `CANDIDATE NAME_MARKER`
    const nameRegex = /CANDIDATE NAME_MARKER\s*(?:[:.]|)?\s*(\d{4})?\s*(?:[:.]|)?\s*([A-Z\s\.:-]+)/i;

    // DOB: "DATE OF BIRTH" [DATE]
    // or "DATE OF BIRTH" somewhere then date later
    const dobRegex = /DATE OF BIRTH\s*[:.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i;

    // UCI: "UNIQUE CANDIDATE IDENTIFIER" [UCI]
    const uciRegex = /UNIQUE CANDIDATE IDENTIFIER\s*[:.]?\s*([A-Z0-9]+)/i;

    // --- Execution ---

    // 1. Name
    let matchName = text.match(nameRegex);
    if (!matchName) {
        // Fallback regex without the MARKER constant if split failed to normalize or we are in fallback block
        // Try finding "CANDIDATE ... NAME" again just in case
        const rawNameRegex = /CAND[1lI]DATE\s+(?:(?:NO|NUMBER)\.?\s+(?:AND\s+)?)?NAME\s*(?:[:.]|)?\s*(\d{4})?\s*(?:[:.]|)?\s*([A-Z\s\.:-]+)/i;
        matchName = text.match(rawNameRegex);
    }

    if (matchName) {
        // Group 1 is number (optional), Group 2 is Name
        // We must be careful not to capture following fields as name usually ends at newline or next label
        let rawName = (matchName[2] || '').trim();

        // Sometimes Name group captures "0001 ASHAQ" if group 1 missed it.
        // Check if starts with 4 digits
        const digitMatch = rawName.match(/^(\d{4})\s+(.+)/);
        if (digitMatch) {
            rawName = digitMatch[2];
        }

        // Stop name at known next labels if they appear on same line
        const stopWords = ['DATE OF BIRTH', 'UNIQUE CANDIDATE IDENTIFIER', 'CENTRE'];
        for (const sw of stopWords) {
            const idx = rawName.toUpperCase().indexOf(sw);
            if (idx !== -1) {
                rawName = rawName.substring(0, idx);
            }
        }
        candidateName = rawName.trim();
    }

    // 2. DOB
    const matchDob = text.match(dobRegex);
    if (matchDob) {
        dob = matchDob[1];
    } else {
        // Fallback: look for generic date pattern near start of string
        // Just picking the first valid-looking date might work if structure is standard
        const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
        if (dateMatch) dob = dateMatch[0];
    }

    // 3. UCI
    const matchUci = text.match(uciRegex);
    if (matchUci) {
        uci = matchUci[1];
    } else {
        // Fallback: look for UCI pattern
        const uciPattern = /\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/;
        const deepMatch = text.match(uciPattern);
        if (deepMatch) uci = deepMatch[0];
    }

    // 4. Grades (AWARD ONLY)
    for (const line of lines) {
        if (line.startsWith('AWARD')) {
            // Structure: AWARD {CODE} {SUBJECT} {MARKS}? {GRADE}
            // Clean "AWARD"
            const content = line.substring(5).trim();
            const parts = content.split(/\s+/);

            if (parts.length >= 2) { // Need at least code and grade/subject
                const code = parts[0];
                let grade = '';
                let subjectEndIndex = -1;

                // Find grade from the end
                // Grade formats: "B(b)", "C(c)", "A*", "A", "U"
                for (let i = parts.length - 1; i >= 1; i--) {
                    const p = parts[i];
                    if (/^[A-E,U]\*?(\([a-z]\))?$/.test(p) || p === 'A*') {
                        grade = p;
                        subjectEndIndex = i;
                        break;
                    }
                }

                if (grade && subjectEndIndex > 0) {
                    // Identify Subject
                    // Everything between Code (0) and Marks/Grade
                    // Marks usually look like 225/300 or just number 225
                    const rawSubjectParts = parts.slice(1, subjectEndIndex);
                    const subjectParts = rawSubjectParts.filter(p => !/^[\d\/]+$/.test(p));

                    const subject = subjectParts.join(' ');
                    if (subject) {
                        grades.push({ code, subject, grade });
                    }
                }
            }
        }
    }

    return {
        candidateName: candidateName || 'Unknown Candidate',
        uci: uci || 'Unknown UCI',
        dob: dob || 'Unknown DOB',
        grades,
        rawText: text.substring(0, 500) // snippet
    };
};
