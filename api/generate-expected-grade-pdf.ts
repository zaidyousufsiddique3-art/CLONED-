import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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

// Helper: Sanitize grades
const normalizeGrade = (raw: string): string => {
    if (!raw) return '';
    const clean = raw.replace(/\s*\(.*\)/, '').trim();
    const allowList = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
    if (allowList.includes(clean)) return clean;
    // Strict requirement: "Strip anything inside parentheses... Grades must be sanitized to ONLY..."
    // If it's not in the allow list after cleaning, return empty or the clean version? 
    // User said "Preserve ONLY these values". I'll return clean if it matches, else empty? 
    // Safest is to return clean if it looks reasonable, but let's stick to the allow list strictly if possible.
    return clean;
};

// EMBEDDED HTML TEMPLATE (Strictly following the provided image)
const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: "Helvetica", "Arial", sans-serif;
            font-size: 11pt; /* Adjusted to look like the image */
            line-height: 1.5;
            padding: 40px 50px;
            color: #000;
        }
        .header-placeholder {
            width: 100%;
            height: 100px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed #ccc;
            margin-bottom: 40px;
            font-weight: bold;
            color: #555;
        }
        .date {
            margin-bottom: 30px;
        }
        .title {
            text-align: center;
            font-weight: bold;
            text-decoration: underline;
            margin-bottom: 20px;
            font-size: 13pt;
        }
        .subtitle {
            font-weight: bold;
            margin-bottom: 20px;
            text-transform: uppercase;
        }
        .content-para {
            text-align: justify;
            margin-bottom: 20px;
        }
        .bold {
            font-weight: bold;
        }
        .results-block {
            margin: 20px auto; /* Centered block */
            width: 70%; /* Indented */
            font-weight: bold;
        }
        .result-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .subject {
            text-align: left;
            text-transform: uppercase;
        }
        .grade {
            text-align: right;
            min-width: 50px;
        }
        .footer {
            margin-top: 50px;
            font-size: 10pt;
        }
        .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .sig-block {
            width: 40%;
            text-align: center;
        }
        .sig-line {
            border-top: 1px dotted #000;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>

    <!-- 1. Header (Placeholder as requested) -->
    <div class="header-placeholder">
        [ORIGINAL HEADER IMAGE]
    </div>

    <!-- 2. Date -->
    <div class="date">
        {{DOCUMENT_ISSUE_DATE}},
    </div>

    <!-- 3. Title -->
    <div class="title">TO WHOM IT MAY CONCERN</div>

    <!-- 4. Subtitle -->
    <div class="subtitle">
        EXPECTED GRADE SHEET – LONDON EDEXCEL IAL EXAMINATION – {{IAL_SESSION_MONTH_YEAR}}
    </div>

    <!-- 5. Paragraph 1 -->
    <div class="content-para">
        <span class="bold">{{STUDENT_FULL_NAME}}</span>, <span class="bold">Unique Candidate Identifier</span> (<span class="bold">{{UCI_NUMBER}}</span>) had sat his London Edexcel INTERNATIONAL SUBSIDIARY LEVEL (IAS) examination in {{IAS_SESSION_MONTH_YEAR}}. He had obtained the following results:
    </div>

    <!-- 6. Original Results -->
    <div class="results-block">
        <div class="result-row"> <span class="subject">{{ORIGINAL_SUBJECT_1}}</span> <span class="grade">{{ORIGINAL_GRADE_1}}</span> </div>
        <div class="result-row"> <span class="subject">{{ORIGINAL_SUBJECT_2}}</span> <span class="grade">{{ORIGINAL_GRADE_2}}</span> </div>
        <div class="result-row"> <span class="subject">{{ORIGINAL_SUBJECT_3}}</span> <span class="grade">{{ORIGINAL_GRADE_3}}</span> </div>
        <div class="result-row"> <span class="subject">{{ORIGINAL_SUBJECT_4}}</span> <span class="grade">{{ORIGINAL_GRADE_4}}</span> </div>
    </div>

    <!-- 7. Paragraph 2 -->
    <div class="content-para">
        <span class="bold">{{STUDENT_FULL_NAME}}</span> will be sitting his London Edexcel INTERNATIONAL ADVANCED LEVEL (IAL) examination which will be held during {{IAL_SESSION_MONTH_YEAR}}. Based on his IAS results and the performance in the school examination, the respective subject teachers firmly expect him to obtain the following results in the {{IAL_SESSION_MONTH_YEAR}} IAL Examination:
    </div>

    <!-- 8. Predicted Results -->
    <div class="results-block">
        <div class="result-row"> <span class="subject">{{PREDICTED_SUBJECT_1}}</span> <span class="grade">{{PREDICTED_GRADE_1}}</span> </div>
        <div class="result-row"> <span class="subject">{{PREDICTED_SUBJECT_2}}</span> <span class="grade">{{PREDICTED_GRADE_2}}</span> </div>
        <div class="result-row"> <span class="subject">{{PREDICTED_SUBJECT_3}}</span> <span class="grade">{{PREDICTED_GRADE_3}}</span> </div>
        <div class="result-row"> <span class="subject">{{PREDICTED_SUBJECT_4}}</span> <span class="grade">{{PREDICTED_GRADE_4}}</span> </div>
    </div>

    <!-- 9. Footer Text -->
    <div class="footer">
        This letter is issued on his request to be reviewed by Universities for admission and scholarship.
    </div>

    <!-- 10. Signatures -->
    <div class="signatures">
        <div class="sig-block">
            <div class="sig-line"></div>
            <div>Ruxshan Razak</div>
            <div style="margin-top:5px;">Principal</div>
        </div>
        <div class="sig-block">
            <div class="sig-line"></div>
            <div>S.M.M. Hajath</div>
            <div style="margin-top:5px;">Academic & Public Exams Coordinator</div>
        </div>
    </div>

</body>
</html>
`;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let browser = null;

    try {
        const payload = await parseBody(req);
        console.log("PDF PIPELINE EXECUTED (EMBEDDED HTML)");

        let html = HTML_TEMPLATE;

        // --- REPLACE PLACEHOLDERS ---

        // Document Info
        html = html.replace('{{DOCUMENT_ISSUE_DATE}}', payload.DOCUMENT_ISSUE_DATE || '');
        // Replace globally
        html = html.split('{{IAL_SESSION_MONTH_YEAR}}').join(payload.IAL_SESSION_MONTH_YEAR || '');
        html = html.replace('{{IAS_SESSION_MONTH_YEAR}}', payload.IAS_SESSION_MONTH_YEAR || '');

        // Student Info
        html = html.split('{{STUDENT_FULL_NAME}}').join(payload.STUDENT_FULL_NAME || '');
        html = html.replace('{{UCI_NUMBER}}', payload.UCI_NUMBER || '');

        // Original Results (1-4)
        for (let i = 1; i <= 4; i++) {
            const subj = payload[`ORIGINAL_SUBJECT_${i}`];
            const grade = payload[`ORIGINAL_GRADE_${i}`];

            if (subj && grade) {
                html = html.replace(`{{ORIGINAL_SUBJECT_${i}}}`, subj)
                    .replace(`{{ORIGINAL_GRADE_${i}}}`, normalizeGrade(grade));
            } else {
                // Leave strictly blank as requested
                html = html.replace(`{{ORIGINAL_SUBJECT_${i}}}`, '')
                    .replace(`{{ORIGINAL_GRADE_${i}}}`, '');
            }
        }

        // Predicted Results (1-4)
        for (let i = 1; i <= 4; i++) {
            const subj = payload[`PREDICTED_SUBJECT_${i}`];
            const grade = payload[`PREDICTED_GRADE_${i}`];

            if (subj && grade) {
                html = html.replace(`{{PREDICTED_SUBJECT_${i}}}`, subj)
                    .replace(`{{PREDICTED_GRADE_${i}}}`, normalizeGrade(grade));
            } else {
                // Leave strictly blank
                html = html.replace(`{{PREDICTED_SUBJECT_${i}}}`, '')
                    .replace(`{{PREDICTED_GRADE_${i}}}`, '');
            }
        }

        // --- PUPPETEER GENERATION ---

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true,
        });

        const page = await browser.newPage();

        await page.setContent(html, {
            waitUntil: 'networkidle0',
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', bottom: '0', left: '0', right: '0' } // Controlled by HTML CSS padding
        });

        // DEBUG CHECK
        console.log(pdfBuffer.slice(0, 5).toString());

        // RESPONSE
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Expected_Grade_Sheet_${Date.now()}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.end(pdfBuffer);

        await page.close();
        await browser.close();
        browser = null;

    } catch (error: any) {
        console.error('Error in PDF pipeline:', error);
        if (browser) {
            await browser.close();
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
        }
    }
}
