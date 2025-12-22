
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createRateLimiter, getClientIp } from './_lib/rateLimit.js';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function parseBody(req: any) {
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    const data = Buffer.concat(buffers).toString();
    return JSON.parse(data);
}

const SAFE_AREA = {
    LEFT: 70,
    RIGHT: 525,
    TOP: 680,
    BOTTOM: 80,
    CENTER_X: (70 + 525) / 2,
};

function drawJustifiedText(
    page: any,
    text: string,
    y: number,
    font: any,
    fontSize: number,
    maxWidth: number,
    lineSpacing: number
): number {
    const words = text.split(' ').filter(word => word.length > 0);
    let currentLine: string[] = [];
    let currentLineY = y;

    for (const word of words) {
        const testLine = [...currentLine, word].join(' ');
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine.length > 0) {
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

                    const wordWidth = font.widthOfTextAtSize(currentLine[i], fontSize);
                    const spaceWidth = font.widthOfTextAtSize(' ', fontSize);

                    if (i < wordsInLine - 1) {
                        currentWordX += wordWidth + spaceWidth + spacePerWord;
                    }
                }
            } else {
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

    return currentLineY;
}

export default async function handler(req: any, res: any) {
    try {
        const limiter = createRateLimiter(10, "5 m");
        const ip = getClientIp(req);
        const { success } = await limiter.limit(`recommendation:${ip}`);

        if (!success) {
            return res.status(429).json({
                error: "Too many requests. Please wait a few minutes and try again."
            });
        }
    } catch (err) {
        console.error("Rate limiting error:", err);
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = await parseBody(req);
        const {
            firstName,
            lastName,
            gender,
            grade,
            refereeName,
            refereeDesignation,
            refereeEmail,
            country,
            selectedOptions,
            additionalInfo
        } = payload;

        const letterheadPath = path.join(process.cwd(), "assets", "expected-grade-letterhead.pdf");
        if (!fs.existsSync(letterheadPath)) {
            throw new Error("Letterhead PDF not found");
        }

        const letterheadBytes = fs.readFileSync(letterheadPath);
        const pdfDoc = await PDFDocument.load(letterheadBytes);
        const page = pdfDoc.getPages()[0];

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontSize = 11;
        const lineSpacing = 16;
        const paragraphGap = 12;

        const isFemale = gender.toLowerCase() === 'female';
        const pronouns = {
            subject: isFemale ? 'she' : 'he',
            Subject: isFemale ? 'She' : 'He',
            possessive: isFemale ? 'her' : 'his',
            Possessive: isFemale ? 'Her' : 'His',
            object: isFemale ? 'her' : 'him',
        };

        let currentY = SAFE_AREA.TOP;

        const today = new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Referee Info at top
        page.drawText(refereeName, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font: fontBold });
        currentY -= lineSpacing;
        page.drawText(refereeDesignation, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing;
        page.drawText('Sri Lankan International School', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing;
        page.drawText('Riyadh, KSA', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing * 1.5;

        // Date
        page.drawText(today, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing * 1.5;

        // Admission Committee
        page.drawText('Admission Committee', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font: fontBold });
        currentY -= lineSpacing;
        page.drawText(country, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing * 3.5; // Added vertical space above title

        // Title - CENTER ALIGNED
        const titleText = `Reference Letter – ${firstName} ${lastName}`;
        const titleWidth = fontBold.widthOfTextAtSize(titleText, fontSize + 1);
        const titleX = SAFE_AREA.CENTER_X - (titleWidth / 2);
        page.drawText(titleText, { x: titleX, y: currentY, size: fontSize + 1, font: fontBold });
        currentY -= lineSpacing * 1.5;

        // Helper to replace markers
        const formatText = (text: string, useFirstNameOnce: boolean = false) => {
            let formatted = text
                .replace(/\[his\/her\]/g, pronouns.possessive)
                .replace(/\[him\/her\]/g, pronouns.object)
                .replace(/\[he\/she\]/g, pronouns.subject);

            if (useFirstNameOnce) {
                // Replace ONLY the first [First Name] with the actual name
                // and subsequent ones with the Subject pronoun.
                let firstMatch = true;
                formatted = formatted.replace(/\[First Name\]/g, () => {
                    if (firstMatch) {
                        firstMatch = false;
                        return firstName;
                    }
                    return pronouns.Subject;
                });
            } else {
                // Replace all [First Name] with Subject pronoun
                formatted = formatted.replace(/\[First Name\]/g, pronouns.Subject);
            }
            return formatted;
        };

        // Opening Paragraph - Full Name once
        const openingParagraph = `I am writing this letter to formally recommend ${firstName} ${lastName}, a student in ${grade} at Sri Lankan International School, Riyadh, for admission to your esteemed institution in ${country}. ${pronouns.Subject} has been an exemplary student at our school, and it is with great pleasure that I provide this reference based on ${pronouns.possessive} academic performance and character.`;
        currentY = drawJustifiedText(page, openingParagraph, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= paragraphGap;

        // Paragraph 1: Selected Option 1 + Option 2 (Combined)
        // [First Name] used once in this combined block.
        const combinedPara1Raw = `${selectedOptions[0]} ${selectedOptions[1]}`;
        const paragraph1 = formatText(combinedPara1Raw, true);
        currentY = drawJustifiedText(page, paragraph1, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= paragraphGap;

        // Paragraph 2: Selected Option 3 + Special Notes (Combined)
        // No [First Name] used here, only pronouns.
        let combinedPara2Raw = selectedOptions[2];
        if (additionalInfo && additionalInfo.trim()) {
            combinedPara2Raw += ` ${additionalInfo.trim()}`;
        }
        const paragraph2 = formatText(combinedPara2Raw, false);
        currentY = drawJustifiedText(page, paragraph2, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= paragraphGap;

        // Closing Paragraph - Fixed wording
        const closingParagraph = `Based on my observation and reports from the teaching staff, I am confident that ${firstName} will be a valuable asset to your academic community. ${pronouns.Subject} carries our highest recommendation for ${pronouns.possessive} future endeavors. If you require any further information, please do not hesitate to contact me at ${refereeEmail}.`;
        currentY = drawJustifiedText(page, closingParagraph, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= lineSpacing;

        // Signature - Traditional Left Alignment
        if (currentY < 150) {
            // If running out of space, just keep drawing and hope for the best, or log
            console.warn("Signature might overflow");
        }

        currentY -= lineSpacing;
        page.drawText('Yours sincerely,', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing * 2;

        page.drawText(refereeName, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font: fontBold });
        currentY -= lineSpacing;
        page.drawText(refereeDesignation, { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing;
        page.drawText('Sri Lankan International School', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });
        currentY -= lineSpacing;
        page.drawText('Riyadh, KSA', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });

        const pdfBytes = await pdfDoc.save();
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Reference Letter - ${firstName} ${lastName}.pdf"`,
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
