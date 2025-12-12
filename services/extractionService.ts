
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for PDF.js
// Note: In a Vite setup, this might require copying the worker file to public or importing it specifically.
// We'll try the standard import first, or use a CDN fallback if local fails in dev.
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

export const extractDataFromFile = async (file: File): Promise<StudentResult> => {
    let text = '';

    if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
    } else if (file.type.startsWith('image/')) {
        text = await extractTextFromImage(file);
    } else {
        throw new Error('Unsupported file type');
    }

    return parseResultText(text);
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
        fullText += pageText + '\n';
    }

    return fullText;
};

const parseResultText = (text: string): StudentResult => {
    // Normalize text to single lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let candidateName = '';
    let uci = '';
    let dob = '';
    const grades: ExtractedGrade[] = [];

    // Regex Patterns
    // UCI pattern: typically 13 chars, e.g., 97293B239220C
    // The user provided image shows UCI under "UNIQUE CANDIDATE IDENTIFIER" box
    const uciRegex = /\b\d{5}[A-Z]\d{7}[A-Z]\b/i;
    // Fallback simplified UCI: just a long alphanumeric string starting with 9 maybe?

    // DOB pattern: DD/MM/YY
    const dobRegex = /\b\d{2}\/\d{2}\/\d{2}\b/;

    // Name extraction strategy:
    // Look for the line containing the Candidate Number (4 digits) and DOB.
    // The name is usually between them.
    // Example: "9220 MOHAMED ZAMEEL:AYSHA 01/07/07"
    const candidateLineRegex = /^(\d{4})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})$/;

    // Parsing loop
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Try to find Candidate Line
        const candidateMatch = line.match(candidateLineRegex);
        if (candidateMatch) {
            // candidateMatch[1] is number, [2] is name, [3] is dob
            candidateName = candidateMatch[2].trim();
            dob = candidateMatch[3];
            continue;
        }

        // Try to find UCI
        // Sometimes UCI is on its own line
        if (!uci) {
            const uciMatch = line.match(uciRegex);
            if (uciMatch) {
                uci = uciMatch[0];
            }
        }

        // Grades (AWARD lines)
        // Example: AWARD YMA01 MATHEMATICS 0368/0600 C (c)
        // Regex: AWARD (Code) (Subject Name) (Marks?) (Grade)
        // Note: PDF extraction often messes up spacing, so we need to be flexible.
        if (line.startsWith('AWARD')) {
            // Remove "AWARD"
            const content = line.substring(5).trim();
            // Split by space
            const parts = content.split(/\s+/);
            if (parts.length >= 3) {
                const code = parts[0];
                // Last part usually grade if it's like "C" or "C(c)"
                // But sometimes there are marks "0368/0600" before grade

                // Let's try to identify the grade at the end
                // Grade pattern: A, B, C, D, E, U, A*, and optional (c) parenthesis
                // Also marks: 000/000

                // Finding the grade index
                let gradeIndex = -1;
                for (let j = parts.length - 1; j >= 0; j--) {
                    if (/^[A-E,U]\*?(\s*\(.\))?$/.test(parts[j])) {
                        gradeIndex = j;
                        break;
                    }
                }

                if (gradeIndex !== -1) {
                    const grade = parts[gradeIndex];
                    // Subject is everything between code and marks/grade
                    // We skip marks if present (format like \d+/\d+)
                    const potentialSubjectParts = parts.slice(1, gradeIndex);
                    // Filter out marks
                    const subjectParts = potentialSubjectParts.filter(p => !/^\d+\/\d+$/.test(p));
                    const subject = subjectParts.join(' ');

                    grades.push({ code, subject, grade });
                }
            }
        }
    }

    // Fallback for Name if regex didn't match perfectly (OCR issues)
    // If we found DOB but not name line, maybe name is before DOB
    if (!candidateName && dob) {
        // Search for line ending with DOB
        const lineWithDob = lines.find(l => l.includes(dob));
        if (lineWithDob) {
            // remove DOB
            let temp = lineWithDob.replace(dob, '').trim();
            // remove candidate number if at start (4 digits)
            temp = temp.replace(/^\d{4}\s+/, '');
            candidateName = temp;
        }
    }

    return {
        candidateName: candidateName || 'Unknown Candidate',
        uci: uci || 'Unknown UCI',
        dob: dob || 'Unknown DOB',
        grades,
        rawText: text // Debug info
    };
};
