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

        // 3. Render fields
        // We iterate over the payload keys to allow strict mapping
        for (const [key, value] of Object.entries(payload)) {
            // Rule: If ANY value === "" or null -> DO NOT render
            if (value === null || value === undefined || value === '') {
                continue;
            }

            const config = FIELD_MAP[key];

            // Should be in our map, else ignore
            if (!config) continue;

            // Page safety check
            if (config.page >= pages.length) {
                console.warn(`[src/pdf] Field ${key} references Page ${config.page} but doc only has ${pages.length} pages.`);
                continue;
            }

            const page = pages[config.page];

            page.drawText(String(value), {
                x: config.x,
                y: config.y,
                size: config.size,
                font: font,
                color: rgb(0, 0, 0),
            });
        }

        // 4. Save and Return Buffer
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);

    } catch (error) {
        console.error('[src/pdf] Error generating PDF:', error);
        throw error;
    }
};
