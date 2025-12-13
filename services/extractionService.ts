
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
 * Checks Cache -> Extracts Text -> Calls AI -> Saves Cache.
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

    // 2. Extract Text locally
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

    // 3. Call AI API
    try {
        console.log(`Sending ${text.length} chars to AI analysis...`);
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.students || [];

        // 4. Save to Cache
        await setDoc(cacheRef, {
            results,
            updatedAt: new Date().toISOString(),
            fileName: file.name
        });

        return results;

    } catch (err) {
        console.error("AI Analysis failed:", err);
        return [];
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
    // Limit pages to avoid huge costs/payloads? Users might have 100 pages. 
    // OpenAI context window is large (128k tokens for turbo), but costs.
    // Prompt instruction said "Result: A single, massive text string". 
    // We'll extract all.
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
    }
    return fullText;
};
