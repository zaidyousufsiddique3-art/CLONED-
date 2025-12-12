
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

    if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
    } else if (file.type.startsWith('image/')) {
        text = await extractTextFromImage(file);
    } else {
        throw new Error('Unsupported file type');
    }

    // Normalize structure before splitting
    // Ensure header tags are somewhat clean for splitting
    // Use a unique marker for splitting blocks: "CANDIDATE NO. AND NAME" appears to be mandatory for each student block
    // If headers are split across lines, we rely on the parser to stitch them or lookahead.

    // Strategy:
    // 1. Split text into chunks using "CANDIDATE NO. AND NAME" or similar anchors.
    // 2. Process each chunk.

    const studentBlocks = splitIntoStudentBlocks(text);
    const results: StudentResult[] = [];

    for (const block of studentBlocks) {
        const res = parseStudentBlock(block);
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
        // Add a distinct page break marker just in case, though usually regex handles it
        fullText += pageText + '\n====PAGE_BREAK====\n';
    }

    return fullText;
};

const splitIntoStudentBlocks = (text: string): string[] => {
    // We use key phrases to split. 
    // "CANDIDATE NO. AND NAME" is the most robust start of a record.
    // We keep the delimiter in the result to parse extraction.

    // Note: OCR might misread CANDIDATE as CAND1DATE etc.
    // Let's normalize key headers first.
    let normalizedText = text
        .replace(/CAND[1lI]DATE NO\. AND NAME/gi, "CANDIDATE NO. AND NAME")
        .replace(/UN[1lI]QUE CAND[1lI]DATE IDENTIFIER/gi, "UNIQUE CANDIDATE IDENTIFIER")
        .replace(/DATE OF B[1lI]RTH/gi, "DATE OF BIRTH");

    const parts = normalizedText.split(/CANDIDATE NO\. AND NAME/i);

    // The first part might be garbage or header of first page if split removes format.
    // But wait, split removes the delimiter. We need to prepend it back or just know that the start of the chunk corresponds to name.

    const blocks: string[] = [];

    // If text starts with it, parts[0] is empty. 
    // If text has header, parts[0] is header junk.

    // If we identify "CANDIDATE NO. AND NAME" implies start of block.
    // Each part (except maybe the first if it doesn't contain a record) is a student.

    // Let's use a more manual approach to be safe with preserving content
    const splitRegex = /(?=CANDIDATE NO\. AND NAME)/i;
    const chunks = normalizedText.split(splitRegex);

    return chunks.filter(c => c.trim().length > 50); // Filter small noise
};

const parseStudentBlock = (text: string): StudentResult => {
    // Clean newlines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let candidateName = '';
    let uci = '';
    let dob = '';
    const grades: ExtractedGrade[] = [];

    // 1. Extract Name
    // Pattern: "CANDIDATE NO. AND NAME" followed by "0001 NAME"
    // Or on same line: "CANDIDATE NO. AND NAME 0001 NAME"
    // The split might have put "CANDIDATE NO. AND NAME" at start of this block or just before.
    // Since we split by lookahead `(?=...)`, the block STARTS with "CANDIDATE NO. AND NAME".

    // Combine first few lines to find headers robustly? 
    // Actually, searching the whole block string with global regex is easier for fields.

    // --- Name ---
    // The regex needs to handle following typical structure:
    // CANDIDATE NO. AND NAME {number} {NAME}
    // The number is typically 4 digits.
    const nameRegex = /CANDIDATE NO\. AND NAME\s.*?(\d{4})\s+([A-Z\s:.-]+)/i;
    const matchName = text.match(nameRegex);
    if (matchName) {
        // Group 2 is Name
        candidateName = matchName[2].trim();
    }

    // --- DOB ---
    // DATE OF BIRTH {DD/MM/YYYY} or {DD/MM/YY}
    const dobRegex = /DATE OF BIRTH\s+(\d{2}\/\d{2}\/\d{2,4})/;
    const matchDob = text.match(dobRegex);
    if (matchDob) {
        dob = matchDob[1];
    } else {
        // Heuristic: adjacent to UNIQUE CANDIDATE IDENTIFIER?
        // In the image "DATE OF BIRTH 08/06/2004 UNIQUE..."
        // Try finding just the date pattern
        const dateGlobal = text.match(/\d{2}\/\d{2}\/\d{4}/); // Prioritize YYYY
        if (dateGlobal && !dob) dob = dateGlobal[0];
    }

    // --- UCI ---
    // UNIQUE CANDIDATE IDENTIFIER {ID}
    // ID is typically regex: 9\d{4}[A-Z]\d{7}[A-Z0-9] or just alphanumeric
    const uciRegex = /UNIQUE CANDIDATE IDENTIFIER\s+([A-Z0-9]+)/i;
    const matchUci = text.match(uciRegex);
    if (matchUci) {
        uci = matchUci[1];
    } else {
        // Search for pattern if label missing
        const uciPattern = /\b9\d{4}[A-Z]\d{7}[A-Z0-9]\b/;
        const matchDeep = text.match(uciPattern);
        if (matchDeep) uci = matchDeep[0];
    }

    // --- Grades (AWARD ONLY) ---
    // We iterate lines for this structure
    for (const line of lines) {
        if (line.startsWith('AWARD')) {
            // Structure: AWARD {CODE} {SUBJECT} {MARKS}? {GRADE}
            // Clean "AWARD"
            const content = line.substring(5).trim();
            const parts = content.split(/\s+/);

            if (parts.length >= 3) {
                const code = parts[0];
                let grade = '';
                let subjectEndIndex = -1;

                // Find grade from the end
                // Grade formats: "B(b)", "C(c)", "A*", "A", "U"
                for (let i = parts.length - 1; i >= 1; i--) {
                    const p = parts[i];
                    // Matches Grade like A, B(b), U, A*
                    // Note: "225/300" is NOT a grade.
                    if (/^[A-E,U](\([a-z]\))?$/.test(p) || p === 'A*') {
                        grade = p;
                        subjectEndIndex = i;
                        break;
                    }
                }

                if (grade && subjectEndIndex > 0) {
                    // Identify Subject
                    // Everything between Code (0) and Marks/Grade
                    // Marks usually look like 225/300 or just number 225? "225/300" in image
                    // Ignore parts that are numbers or fraction
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
        rawText: text.substring(0, 200) + '...' // Snippet for debug
    };
};
