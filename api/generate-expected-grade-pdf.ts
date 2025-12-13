import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import admin from 'firebase-admin';

// STEP 1 — FORCE NODE RUNTIME (NON-NEGOTIABLE)
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper: Parse body since bodyParser is false
async function parseBody(req: any) {
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    const data = Buffer.concat(buffers).toString();
    return JSON.parse(data);
}

// Initialize Firebase Admin (Singleton)
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

// Helper: Sanitize grades
const normalizeGrade = (raw: string): string => {
    if (!raw) return '';
    const clean = raw.replace(/\s*\(.*\)/, '').trim();
    const allowList = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
    if (allowList.includes(clean)) return clean;
    return clean;
};

// Helper: Generate HTML rows
const generateRows = (subjects: string[], grades: string[]) => {
    let rows = '';
    for (let i = 0; i < 4; i++) {
        const subject = subjects[i];
        let grade = grades[i];

        if (subject && grade) {
            grade = normalizeGrade(grade);
            rows += `
            <tr>
              <td>${subject}</td>
              <td class="grade">${grade}</td>
            </tr>`;
        }
    }
    return rows;
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let browser = null;

    try {
        const payload = await parseBody(req);
        console.log("HTML PIPELINE EXECUTED (FINAL FIX)");

        // 1. Download HTML Template from Firebase
        const bucket = admin.storage().bucket();
        const file = bucket.file('templates/SLISR_EXPECTED_GRADE_TEMPLATE.html');
        const [exists] = await file.exists();

        if (!exists) {
            throw new Error('HTML Template not found in Storage');
        }

        const [content] = await file.download();
        let html = content.toString('utf-8');

        // 2. Prepare Data
        const originalSubjects = [
            payload.ORIGINAL_SUBJECT_1, payload.ORIGINAL_SUBJECT_2,
            payload.ORIGINAL_SUBJECT_3, payload.ORIGINAL_SUBJECT_4
        ];
        const originalGrades = [
            payload.ORIGINAL_GRADE_1, payload.ORIGINAL_GRADE_2,
            payload.ORIGINAL_GRADE_3, payload.ORIGINAL_GRADE_4
        ];

        const predictedSubjects = [
            payload.PREDICTED_SUBJECT_1, payload.PREDICTED_SUBJECT_2,
            payload.PREDICTED_SUBJECT_3, payload.PREDICTED_SUBJECT_4
        ];
        const predictedGrades = [
            payload.PREDICTED_GRADE_1, payload.PREDICTED_GRADE_2,
            payload.PREDICTED_GRADE_3, payload.PREDICTED_GRADE_4
        ];

        // 3. Inject Placeholders
        html = html.replace('{{DOCUMENT_ISSUE_DATE}}', payload.DOCUMENT_ISSUE_DATE || '')
            .replace('{{STUDENT_FULL_NAME}}', payload.STUDENT_FULL_NAME || '')
            .replace('{{UCI_NUMBER}}', payload.UCI_NUMBER || '')
            .replace('{{IAS_SESSION_MONTH_YEAR}}', payload.IAS_SESSION_MONTH_YEAR || '')
            .split('{{IAL_SESSION_MONTH_YEAR}}').join(payload.IAL_SESSION_MONTH_YEAR || '');

        // Generate Rows
        const originalRows = generateRows(originalSubjects, originalGrades);
        const predictedRows = generateRows(predictedSubjects, predictedGrades);

        html = html.replace('{{ORIGINAL_RESULTS_ROWS}}', originalRows)
            .replace('{{PREDICTED_RESULTS_ROWS}}', predictedRows);

        // STEP 2 — PUPPETEER SETUP (VERCEL SAFE)
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true,
        });

        const page = await browser.newPage();

        // STEP 3 — HTML RENDERING (REQUIRED)
        await page.setContent(html, {
            waitUntil: 'networkidle0',
        });

        // STEP 4 — PDF GENERATION (STRICT)
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
        });

        // DEBUG VERIFICATION (ONCE)
        console.log(pdfBuffer.slice(0, 5).toString());

        // STEP 5 — RESPONSE (THIS IS THE ROOT CAUSE)
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Expected_Grade_Sheet_${Date.now()}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.end(pdfBuffer);

        // STEP 6 — CLOSE RESOURCES
        await page.close();
        await browser.close();
        browser = null;

    } catch (error: any) {
        console.error('Error in HTML-to-PDF pipeline:', error);
        if (browser) { // Clean up browser even on error
            await browser.close();
        }
        // Fallback response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
        }
    }
}
