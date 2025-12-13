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

const TEMPLATE_PATH = 'templates/SLISR_EXPECTED_GRADE_TEMPLATE_v1.pdf';

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

// Field Map Scaffold
// These coordinates are placeholders and should be adjusted to match the actual template
// Field Map - Calibrated for Alignment
// Grid System:
// - Left Margin (Subjects): x = 60
// - Right Column (Grades): x = 360
// - Row Spacing: 25pts
// - Header Baseline: y = 705
const FIELD_MAP: Record<string, { page: number; x: number; y: number; size: number }> = {
    // --- Header Info ---
    STUDENT_FULL_NAME: { page: 0, x: 125, y: 705, size: 10 },
    UCI_NUMBER: { page: 0, x: 125, y: 685, size: 10 },
    DOCUMENT_ISSUE_DATE: { page: 0, x: 440, y: 755, size: 10 }, // Top Right

    // Session Info
    IAS_SESSION_MONTH_YEAR: { page: 0, x: 150, y: 630, size: 10 },
    IAL_SESSION_MONTH_YEAR: { page: 0, x: 400, y: 630, size: 10 },

    // --- Original Grades (IAS) ---
    // Block Start Y: 560
    ORIGINAL_SUBJECT_1: { page: 0, x: 60, y: 560, size: 10 },
    ORIGINAL_GRADE_1: { page: 0, x: 360, y: 560, size: 10 },

    ORIGINAL_SUBJECT_2: { page: 0, x: 60, y: 535, size: 10 },
    ORIGINAL_GRADE_2: { page: 0, x: 360, y: 535, size: 10 },

    ORIGINAL_SUBJECT_3: { page: 0, x: 60, y: 510, size: 10 },
    ORIGINAL_GRADE_3: { page: 0, x: 360, y: 510, size: 10 },

    ORIGINAL_SUBJECT_4: { page: 0, x: 60, y: 485, size: 10 },
    ORIGINAL_GRADE_4: { page: 0, x: 360, y: 485, size: 10 },

    // --- Predicted Grades (IAL) ---
    // Block Start Y: 410
    PREDICTED_SUBJECT_1: { page: 0, x: 60, y: 410, size: 10 },
    PREDICTED_GRADE_1: { page: 0, x: 360, y: 410, size: 10 },

    PREDICTED_SUBJECT_2: { page: 0, x: 60, y: 385, size: 10 },
    PREDICTED_GRADE_2: { page: 0, x: 360, y: 385, size: 10 },

    PREDICTED_SUBJECT_3: { page: 0, x: 60, y: 360, size: 10 },
    PREDICTED_GRADE_3: { page: 0, x: 360, y: 360, size: 10 },

    PREDICTED_SUBJECT_4: { page: 0, x: 60, y: 335, size: 10 },
    PREDICTED_GRADE_4: { page: 0, x: 360, y: 335, size: 10 },
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
