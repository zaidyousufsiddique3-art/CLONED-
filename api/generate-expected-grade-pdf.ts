import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// FORCE NODE RUNTIME
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

// Helper: Sanitize grades - DISPLAY AS-IS, NO NORMALIZATION
const normalizeGrade = (raw: string): string => {
    return raw || ''; // Return exactly as provided, preserving parentheses content
};

// SAFE CONTENT AREA (ABSOLUTE PDF COORDINATES)
// Top adjusted to 680 to start immediately below the header divider line
const SAFE_AREA = {
    LEFT: 70,
    RIGHT: 525,
    TOP: 680,
    BOTTOM: 120,
    CENTER_X: (70 + 525) / 2, // 297.5
};

// Helper: Draw center-aligned text
function drawCenteredText(
    page: any,
    text: string,
    y: number,
    font: any,
    size: number,
    color = rgb(0, 0, 0)
) {
    const textWidth = font.widthOfTextAtSize(text, size);
    const x = SAFE_AREA.CENTER_X - textWidth / 2;

    // Ensure text stays within safe area
    if (x < SAFE_AREA.LEFT || x + textWidth > SAFE_AREA.RIGHT) {
        console.warn(`Text overflow detected at y=${y}: "${text}"`);
    }

    page.drawText(text, {
        x,
        y,
        size,
        font,
        color,
    });
}

import { createRateLimiter, getClientIp } from './_lib/rateLimit';

export default async function handler(req: any, res: any) {
    // RATE LIMITING (Heavy Endpoint: 10 req / 5 min)
    try {
        const limiter = createRateLimiter(10, "5 m");
        const ip = getClientIp(req);
        const { success } = await limiter.limit(`pdf:${ip}`);

        if (!success) {
            return res.status(429).json({
                error: "Too many requests. Please wait a few minutes and try again."
            });
        }
    } catch (err) {
        console.error("Rate limiting error:", err);
        return res.status(503).json({ error: "Service temporarily unavailable (Rate Limit Check Failed)" });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = await parseBody(req);
        console.log("PDF PIPELINE EXECUTED (pdf-lib with letterhead)");

        // STEP 1: Load the locked letterhead PDF
        // CRITICAL: Letterhead must be in /assets (server-bundled), NOT /public (static)
        const letterheadPath = path.join(
            process.cwd(),
            "assets",
            "expected-grade-letterhead.pdf"
        );

        if (!fs.existsSync(letterheadPath)) {
            console.error(`Letterhead PDF not found at: ${letterheadPath}`);
            console.error(`process.cwd(): ${process.cwd()}`);
            throw new Error("Letterhead PDF not found at build/runtime path");
        }

        console.log(`✓ Letterhead found at: ${letterheadPath}`);
        const letterheadBytes = fs.readFileSync(letterheadPath);
        const pdfDoc = await PDFDocument.load(letterheadBytes);


        // Get the first page (letterhead is the background)
        const pages = pdfDoc.getPages();
        const page = pages[0];

        // Embed fonts
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Base font size (can be reduced by max 1pt if needed)
        let fontSize = 11;

        // Gender Logic
        const gender = payload.GENDER || 'male';
        const isFemale = gender === 'female';
        const pronouns = {
            possessive: isFemale ? 'her' : 'his',
            subjectTitle: isFemale ? 'She' : 'He',
            object: isFemale ? 'her' : 'him'
        };

        // Extract data
        const studentName = payload.STUDENT_FULL_NAME || '';
        const uci = payload.UCI_NUMBER || '';
        const docDate = payload.DOCUMENT_ISSUE_DATE || '';
        const ialSession = payload.IAL_SESSION_MONTH_YEAR || '';
        const iasSession = payload.IAS_SESSION_MONTH_YEAR || '';

        // Original grades (IAS results)
        const originalGrades = [];
        for (let i = 1; i <= 4; i++) {
            const subj = payload[`ORIGINAL_SUBJECT_${i}`];
            const grade = payload[`ORIGINAL_GRADE_${i}`];
            if (subj && grade) {
                originalGrades.push({
                    subject: subj.toUpperCase(),
                    grade: normalizeGrade(grade)
                });
            }
        }

        // Predicted grades (IAL predictions)
        const predictedGrades = [];
        for (let i = 1; i <= 4; i++) {
            const subj = payload[`PREDICTED_SUBJECT_${i}`];
            const grade = payload[`PREDICTED_GRADE_${i}`];
            if (subj && grade) {
                predictedGrades.push({
                    subject: subj.toUpperCase(),
                    grade: normalizeGrade(grade)
                });
            }
        }

        // STEP 2: Overlay dynamic text (EXACT LAYOUT - DO NOT MODIFY)
        // All Y coordinates are from bottom of page (PDF coordinate system)
        // NOTE: The letterhead PDF contains ONLY the header/logo at the top
        // We overlay ALL dynamic content: date, title, subtitle, paragraphs, grades, footer, and signatures


        let currentY = SAFE_AREA.TOP;
        const lineSpacing = 18; // 1.5 line spacing (1.5 * 12pt approx)
        const sectionSpacing = 20; // Default spacing (unused for header sections now)
        const resultSpacing = 20; // 2x vertical spacing between grade rows

        // Date (top of content area)
        page.drawText(`${docDate},`, {
            x: SAFE_AREA.LEFT,
            y: currentY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
        });
        currentY -= 50; // Visual Match: Large gap between Date and Title

        // Title: TO WHOM IT MAY CONCERN (center-aligned, bold, underlined)
        const titleText = 'TO WHOM IT MAY CONCERN';
        const titleWidth = fontBold.widthOfTextAtSize(titleText, 13);
        const titleX = SAFE_AREA.CENTER_X - titleWidth / 2;
        page.drawText(titleText, {
            x: titleX,
            y: currentY,
            size: 13,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
        // Draw underline
        page.drawLine({
            start: { x: titleX, y: currentY - 2 },
            end: { x: titleX + titleWidth, y: currentY - 2 },
            thickness: 1,
            color: rgb(0, 0, 0),
        });
        currentY -= 35; // Visual Match: Gap between Title and Subtitle

        // Subtitle: EXPECTED GRADE SHEET...
        const subtitleText = `EXPECTED GRADE SHEET – LONDON EDEXCEL IAL EXAMINATION – ${ialSession}`;
        page.drawText(subtitleText, {
            x: SAFE_AREA.LEFT,
            y: currentY,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
        currentY -= 35; // Visual Match: Gap between Subtitle and Paragraph 1

        // Helper: Draw justified text
        function drawJustifiedText(
            page: any,
            text: string,
            y: number,
            font: any,
            fontSize: number,
            maxWidth: number,
            lineSpacing: number
        ): number {
            const words = text.split(' ');
            let currentLine: string[] = [];
            let currentLineY = y;

            for (const word of words) {
                const testLine = [...currentLine, word].join(' ');
                const testWidth = font.widthOfTextAtSize(testLine, fontSize);

                if (testWidth > maxWidth && currentLine.length > 0) {
                    // Draw current line justified
                    const lineText = currentLine.join(' ');
                    const lineWidth = font.widthOfTextAtSize(lineText, fontSize);
                    const extraSpace = maxWidth - lineWidth;
                    const wordsInLine = currentLine.length;

                    if (wordsInLine > 1) {
                        const spacePerWord = extraSpace / (wordsInLine - 1);
                        let currentWordX = SAFE_AREA.LEFT;

                        for (let i = 0; i < wordsInLine; i++) {
                            page.drawText(currentLine[i], {
                                x: currentWordX,
                                y: currentLineY,
                                size: fontSize,
                                font,
                                color: rgb(0, 0, 0),
                            });

                            // Advance X by word width + normal space + extra space
                            const wordWidth = font.widthOfTextAtSize(currentLine[i], fontSize);
                            // Standard space width
                            const spaceWidth = font.widthOfTextAtSize(' ', fontSize);

                            if (i < wordsInLine - 1) {
                                currentWordX += wordWidth + spaceWidth + spacePerWord;
                            }
                        }
                    } else {
                        // Single word line - left align
                        page.drawText(lineText, {
                            x: SAFE_AREA.LEFT,
                            y: currentLineY,
                            size: fontSize,
                            font,
                            color: rgb(0, 0, 0),
                        });
                    }

                    currentLine = [word];
                    currentLineY -= lineSpacing;
                } else {
                    currentLine.push(word);
                }
            }

            // Draw last line (left aligned)
            if (currentLine.length > 0) {
                page.drawText(currentLine.join(' '), {
                    x: SAFE_AREA.LEFT,
                    y: currentLineY,
                    size: fontSize,
                    font,
                    color: rgb(0, 0, 0),
                });
                currentLineY -= lineSpacing;
            }

            return currentLineY; // Return new Y position
        }
        //... (in handler)

        // Paragraph 1 (Justified)
        const para1 = `${studentName}, Unique Candidate Identifier (${uci}) had sat ${pronouns.possessive} London Edexcel INTERNATIONAL SUBSIDIARY LEVEL (IAS) examination in ${iasSession}. ${pronouns.subjectTitle} had obtained the following results:`;
        const maxWidth = SAFE_AREA.RIGHT - SAFE_AREA.LEFT;
        currentY = drawJustifiedText(page, para1, currentY, font, fontSize, maxWidth, lineSpacing);
        currentY -= 10; // Extra spacing before results

        // Original Results (center-aligned, bold, minimal spacing)
        for (const result of originalGrades) {
            const resultText = `${result.subject}    ${result.grade}`;
            drawCenteredText(page, resultText, currentY, fontBold, fontSize);
            currentY -= resultSpacing;
        }
        currentY -= 10; // Extra spacing after results

        // Paragraph 2 (Justified)
        const para2 = `${studentName} will be sitting ${pronouns.possessive} London Edexcel INTERNATIONAL ADVANCED LEVEL (IAL) examination which will be held during ${ialSession}. Based on ${pronouns.possessive} IAS results and the performance in the school examination, the respective subject teachers firmly expect ${pronouns.object} to obtain the following results in the ${ialSession} IAL Examination:`;
        currentY = drawJustifiedText(page, para2, currentY, font, fontSize, maxWidth, lineSpacing);
        currentY -= 10; // Extra spacing before results

        // Predicted Results (center-aligned, bold, minimal spacing)
        for (const result of predictedGrades) {
            const resultText = `${result.subject}    ${result.grade}`;
            drawCenteredText(page, resultText, currentY, fontBold, fontSize);
            currentY -= resultSpacing;
        }
        currentY -= 20; // Extra spacing after results

        // Footer text (Justified)
        const footerText = `This letter is issued on ${pronouns.possessive} request to be reviewed by Universities for admission and scholarship.`;
        currentY = drawJustifiedText(page, footerText, currentY, font, fontSize, maxWidth, lineSpacing);

        currentY -= 85; // Increased space before signatures (Match Screenshot 1 Y-position)


        // Signatures section (two columns)
        const sigY = currentY;
        const sigLineLength = 120;
        const leftSigX = SAFE_AREA.LEFT; // Aligned with left margin
        const rightSigX = SAFE_AREA.RIGHT - 170;

        // Left signature - Principal
        // Dotted line
        for (let x = leftSigX; x < leftSigX + sigLineLength; x += 4) {
            page.drawLine({
                start: { x, y: sigY },
                end: { x: x + 2, y: sigY },
                thickness: 0.5,
                color: rgb(0, 0, 0),
            });
        }
        page.drawText('Ruxshan Razak', {
            x: leftSigX,
            y: sigY - 15,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
        });
        page.drawText('Principal', {
            x: leftSigX,
            y: sigY - 30,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
        });

        // Right signature - Coordinator
        // Dotted line
        for (let x = rightSigX; x < rightSigX + sigLineLength; x += 4) {
            page.drawLine({
                start: { x, y: sigY },
                end: { x: x + 2, y: sigY },
                thickness: 0.5,
                color: rgb(0, 0, 0),
            });
        }
        page.drawText('S.M.M. Hajath', {
            x: rightSigX,
            y: sigY - 15,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
        });
        page.drawText('Academic & Public Exams Coordinator', {
            x: rightSigX,
            y: sigY - 30,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
        });

        // Check if we're within safe area
        const finalY = sigY - 30;
        if (finalY < SAFE_AREA.BOTTOM) {
            console.warn(`Content overflow detected. Final Y: ${finalY}, Safe Bottom: ${SAFE_AREA.BOTTOM}`);
            // If overflow, reduce font size by 1pt and regenerate
            // (This would require refactoring into a function - for now, log warning)
        }


        // STEP 3: Save and return PDF
        const pdfBytes = await pdfDoc.save();

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Expected_Grade_Sheet_${Date.now()}.pdf"`,
            'Content-Length': pdfBytes.length,
        });

        res.end(Buffer.from(pdfBytes));

    } catch (error: any) {
        console.error('Error in PDF pipeline:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
        }
    }
}
