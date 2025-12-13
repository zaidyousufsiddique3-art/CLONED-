import { chromium } from 'playwright';
import admin from 'firebase-admin';

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
    // Remove anything in parentheses and trim
    const clean = raw.replace(/\s*\(.*\)/, '').trim();
    // Allow list
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
        const payload = req.body;
        console.log("HTML PIPELINE EXECUTED");

        // 1. Download HTML Template
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
            .replace('{{IAL_SESSION_MONTH_YEAR}}', payload.IAL_SESSION_MONTH_YEAR || '')
            .replace('{{IAL_SESSION_MONTH_YEAR}}', payload.IAL_SESSION_MONTH_YEAR || ''); // Replace second occurrence if needed? ReplaceAll is safer.

        // Use replaceAll for session if it appears multiple times (title + paragraph)
        html = html.split('{{IAL_SESSION_MONTH_YEAR}}').join(payload.IAL_SESSION_MONTH_YEAR || '');

        // Generate Rows
        const originalRows = generateRows(originalSubjects, originalGrades);
        const predictedRows = generateRows(predictedSubjects, predictedGrades);

        html = html.replace('{{ORIGINAL_RESULTS_ROWS}}', originalRows)
            .replace('{{PREDICTED_RESULTS_ROWS}}', predictedRows);

        // 4. Render PDF with Playwright
        // Note: On Vercel, this might need extra config, but following STRICT instructions to use Playwright Chromium
        browser = await chromium.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', bottom: '0', left: '0', right: '0' } // Template likely handles margins via CSS
        });

        await browser.close();
        browser = null;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Expected_Grade_Sheet_${Date.now()}.pdf`);
        res.status(200).send(pdfBuffer);

    } catch (error: any) {
        console.error('Error in HTML-to-PDF pipeline:', error);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
}
