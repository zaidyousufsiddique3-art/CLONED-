import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import admin from 'firebase-admin';

// Initialize Firebase Admin (Singleton)
// This mirrors logic in other backend modules to ensure connectivity
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'slisr-updated.firebasestorage.app',
    });
}

const TEMPLATE_PATH = 'templates/SLISR_EXPECTED_GRADE_TEMPLATE_v2.pdf';

// STRICT Payload Shape
export interface ExpectedGradePdfPayload {
    STUDENT_FULL_NAME: string;
    UCI_NUMBER: string;
    DOCUMENT_ISSUE_DATE: string;
    IAS_SESSION_MONTH_YEAR: string;
    IAL_SESSION_MONTH_YEAR: string;

    ORIGINAL_SUBJECT_1: string;
    ORIGINAL_GRADE_1: string;
    ORIGINAL_SUBJECT_2: string;
    ORIGINAL_GRADE_2: string;
    ORIGINAL_SUBJECT_3: string;
    ORIGINAL_GRADE_3: string;
    ORIGINAL_SUBJECT_4: string;
    ORIGINAL_GRADE_4: string;

    PREDICTED_SUBJECT_1: string;
    PREDICTED_GRADE_1: string;
    PREDICTED_SUBJECT_2: string;
    PREDICTED_GRADE_2: string;
    PREDICTED_SUBJECT_3: string;
    PREDICTED_GRADE_3: string;
    PREDICTED_SUBJECT_4: string;
    PREDICTED_GRADE_4: string;
}

// Field Map - Final Calibration (Invisible Box Alignment)
// A4 Canvas: 595 x 842 pts (approx)
// Grid: Left Margin x=72, Grade Column x=350
// Row Spacing: 20pts
const FIELD_MAP: Record<string, { page: number; x: number; y: number; size: number }> = {
    // --- Header & Meta ---
    // Top right date
    DOCUMENT_ISSUE_DATE: { page: 0, x: 430, y: 735, size: 10 },

    // Subject Line Variable (IAL Session)
    // "EXPECTED GRADE SHEET ... - [SESSION]"
    // text y is baseline
    IAL_SESSION_MONTH_YEAR_TITLE: { page: 0, x: 380, y: 690, size: 11 }, // Note: This key needs to be mapped if used separately, defaulting to IAL_SESSION for now if strictly payload bound

    // Paragraph 1 Fields
    // "... [NAME], Unique Candidate Identifier ([UCI]) ..."
    STUDENT_FULL_NAME: { page: 0, x: 72, y: 658, size: 10 },
    UCI_NUMBER: { page: 0, x: 320, y: 658, size: 10 },

    // "... (IAS) examination in [SESSION] ..."
    IAS_SESSION_MONTH_YEAR: { page: 0, x: 230, y: 644, size: 10 },

    // Paragraph 2 Fields
    // "... (IAL) examination which will be held during [SESSION] ..."
    IAL_SESSION_MONTH_YEAR: { page: 0, x: 280, y: 468, size: 10 },


    // --- Original Results (Table 1) ---
    // Start Y: 580 (Header is above)
    // Spacing: 20pts
    ORIGINAL_SUBJECT_1: { page: 0, x: 120, y: 580, size: 10 },
    ORIGINAL_GRADE_1: { page: 0, x: 400, y: 580, size: 10 },

    ORIGINAL_SUBJECT_2: { page: 0, x: 120, y: 560, size: 10 },
    ORIGINAL_GRADE_2: { page: 0, x: 400, y: 560, size: 10 },

    ORIGINAL_SUBJECT_3: { page: 0, x: 120, y: 540, size: 10 },
    ORIGINAL_GRADE_3: { page: 0, x: 400, y: 540, size: 10 },

    ORIGINAL_SUBJECT_4: { page: 0, x: 120, y: 520, size: 10 },
    ORIGINAL_GRADE_4: { page: 0, x: 400, y: 520, size: 10 },


    // --- Predicted Results (Table 2) ---
    // Start Y: 380
    // Spacing: 20pts
    PREDICTED_SUBJECT_1: { page: 0, x: 120, y: 380, size: 10 },
    PREDICTED_GRADE_1: { page: 0, x: 400, y: 380, size: 10 },

    PREDICTED_SUBJECT_2: { page: 0, x: 120, y: 360, size: 10 },
    PREDICTED_GRADE_2: { page: 0, x: 400, y: 360, size: 10 },

    PREDICTED_SUBJECT_3: { page: 0, x: 120, y: 340, size: 10 },
    PREDICTED_GRADE_3: { page: 0, x: 400, y: 340, size: 10 },

    PREDICTED_SUBJECT_4: { page: 0, x: 120, y: 320, size: 10 },
    PREDICTED_GRADE_4: { page: 0, x: 400, y: 320, size: 10 },
};

/**
 * Generates an Expected Grade PDF by overlaying data onto the master template.
 * Validates payload and ensures no nulls are printed.
 */
export const generateExpectedGradePdf = async (payload: ExpectedGradePdfPayload): Promise<Buffer> => {
    try {
        console.log('[src/pdf] Starting PDF Generation...');

        // 1. Download Template from Firebase Storage
        const bucket = admin.storage().bucket();
        const file = bucket.file(TEMPLATE_PATH);

        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error(`Template not found at ${TEMPLATE_PATH} in bucket ${bucket.name}`);
        }

        const [fileBuffer] = await file.download();
        console.log('[src/pdf] Template downloaded successfully.');

        // 2. Load PDF into pdf-lib
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const pages = pdfDoc.getPages();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Helper: Sanitize grades to remove suffixes like " (a)"
        const normalizeGrade = (raw: string): string => {
            if (!raw) return '';
            // Remove anything in parentheses and trim
            // e.g. "A (a)" -> "A", "A*" -> "A*"
            const clean = raw.replace(/\s*\(.*\)/, '').trim();
            // Validate allowlist (optional but good for strictness)
            const allowList = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
            if (allowList.includes(clean)) return clean;
            return clean; // Fallback: return cleaned string even if weird
        };

        // 3. Render fields in STRICT ZONES (Interleaved)

        const page = pages[0];

        // --- ZONE 1: HEADER & FIRST PARAGRAPH ---
        const firstBlockFields = [
            'DOCUMENT_ISSUE_DATE',
            'IAL_SESSION_MONTH_YEAR_TITLE',
            'STUDENT_FULL_NAME',
            'UCI_NUMBER',
            'IAS_SESSION_MONTH_YEAR'
        ];

        for (const key of firstBlockFields) {
            let valStr = '';
            if (key === 'IAL_SESSION_MONTH_YEAR_TITLE') {
                valStr = payload.IAL_SESSION_MONTH_YEAR;
            } else {
                valStr = String((payload as any)[key] || '');
            }

            if (!valStr) continue;

            const config = FIELD_MAP[key];
            if (config) {
                page.drawText(valStr, {
                    x: config.x,
                    y: config.y,
                    size: config.size,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
        }

        // --- ZONE 2: ORIGINAL RESULTS (ROW BLOCK) ---
        // Start Y: 580, Spacing: 20
        let currentY_Original = 580;
        const ROW_SPACING = 20;

        for (let i = 1; i <= 4; i++) {
            const subjectKey = `ORIGINAL_SUBJECT_${i}`;
            const gradeKey = `ORIGINAL_GRADE_${i}`;

            const subject = (payload as any)[subjectKey];
            let grade = (payload as any)[gradeKey];

            if (subject && grade) {
                grade = normalizeGrade(String(grade));

                // Render Subject (Left: 120)
                page.drawText(String(subject), {
                    x: 120,
                    y: currentY_Original,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Render Grade (Right Column: 400)
                page.drawText(grade, {
                    x: 400,
                    y: currentY_Original,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                currentY_Original -= ROW_SPACING;
            }
        }

        // --- ZONE 3: SECOND PARAGRAPH ---
        // Render IAL Session text *between* the tables
        const secondBlockFields = ['IAL_SESSION_MONTH_YEAR'];

        for (const key of secondBlockFields) {
            const valStr = String((payload as any)[key] || '');
            if (!valStr) continue;

            const config = FIELD_MAP[key];
            if (config) {
                page.drawText(valStr, {
                    x: config.x,
                    y: config.y,
                    size: config.size,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
        }

        // --- ZONE 4: PREDICTED RESULTS (ROW BLOCK) ---
        // Start Y: 380, Spacing: 20
        let currentY_Predicted = 380;

        for (let i = 1; i <= 4; i++) {
            const subjectKey = `PREDICTED_SUBJECT_${i}`;
            const gradeKey = `PREDICTED_GRADE_${i}`;

            const subject = (payload as any)[subjectKey];
            let grade = (payload as any)[gradeKey];

            if (subject && grade) {
                grade = normalizeGrade(String(grade));

                // Render Subject (Left: 120)
                page.drawText(String(subject), {
                    x: 120,
                    y: currentY_Predicted,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                // Render Grade (Right Column: 400)
                page.drawText(grade, {
                    x: 400,
                    y: currentY_Predicted,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0),
                });

                currentY_Predicted -= ROW_SPACING;
            }
        }

        // 4. Save and Return Buffer
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);

    } catch (error) {
        console.error('[src/pdf] Error generating PDF:', error);
        throw error;
    }
};
