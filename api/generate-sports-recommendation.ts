
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
        const { success } = await limiter.limit(`sports-recommendation:${ip}`);

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
            sportsAchievements,
            appreciativeStatement,
            signatureUrl,
            PRINCIPAL_SIGNATURE_URL,
            PRINCIPAL_STAMP_URL
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
        const fontSize = 10;
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

        // Header Info
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
        currentY -= lineSpacing * 3.5;

        // Title
        const titleText = `Recommendation Letter – ${firstName} ${lastName}`;
        const titleWidth = fontBold.widthOfTextAtSize(titleText, 12);
        const titleX = SAFE_AREA.CENTER_X - (titleWidth / 2);
        page.drawText(titleText, { x: titleX, y: currentY, size: 12, font: fontBold });
        currentY -= lineSpacing * 1.5;

        // Paragraph 1: Introduction (Static)
        const p1 = `I am writing this letter in my capacity as the Sports Coordinator at Sri Lankan International School, Riyadh, to formally recommend ${firstName} ${lastName}. Having observed ${pronouns.possessive} athletic journey over the years, I have seen ${pronouns.object} grow into a dedicated and highly disciplined individual. ${pronouns.Subject} has been an integral part of our school’s sporting community, consistently demonstrating a passion for excellence.`;
        currentY = drawJustifiedText(page, p1, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= paragraphGap;

        // Paragraph 2: Sports Involvement (Dynamic)
        // Extract sports mentioned in descriptions
        const sportsKeywords = ['badminton', 'athletics', 'football', 'cricket', 'basketball', 'swimming', 'volleyball', 'table tennis'];
        const mentionedSports = sportsKeywords.filter(sport =>
            sportsAchievements.some((a: any) => a.description.toLowerCase().includes(sport))
        );

        let p2 = `During ${pronouns.possessive} time at the school, ${pronouns.subject} has actively represented the institution in `;
        if (mentionedSports.length > 0) {
            p2 += mentionedSports.join(' and ') + ", ";
        } else {
            p2 += "various sporting disciplines, ";
        }
        p2 += `achieving notable success in several competitions. ${pronouns.Subject} has participated in numerous tournaments, contributing significantly to the school’s athletic progress.`;

        currentY = drawJustifiedText(page, p2, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= paragraphGap;

        // Paragraph 3: Achievement Highlights (Dynamic)
        // Loop through achievements
        let p3 = `Notably, ${pronouns.subject} `;
        const highlights = sportsAchievements.map((a: any) => {
            return `emerged as the ${a.description} in ${a.month} ${a.year}`;
        }).join(', and later ');

        p3 += highlights + ". These achievements reflect ${pronouns.possessive} hard work and the high standards ${pronouns.subject} sets for ${pronouns.object}self.";

        // Use the appreciative statement from the UI if available, as it likely contains a better summary
        if (appreciativeStatement) {
            currentY = drawJustifiedText(page, appreciativeStatement, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        } else {
            currentY = drawJustifiedText(page, p3, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        }
        currentY -= paragraphGap;

        // Paragraph 4: Character & Recommendation (Semi-dynamic)
        const p4 = `This success is a direct result of ${pronouns.possessive} discipline, teamwork, and perseverance. ${pronouns.Subject} possesses the resilience required to succeed in competitive environments, and I am confident that ${pronouns.subject} will be a valuable asset to your university. ${pronouns.Subject} carries my highest recommendation for future endeavors. If you require further information, please feel free to contact me at ${refereeEmail}.`;
        currentY = drawJustifiedText(page, p4, currentY, font, fontSize, SAFE_AREA.RIGHT - SAFE_AREA.LEFT, lineSpacing);
        currentY -= lineSpacing;

        // Closing
        page.drawText('Yours sincerely,', { x: SAFE_AREA.LEFT, y: currentY, size: fontSize, font });

        const sigLineLength = 150;
        const lineY = currentY - 45;

        // Draw dotted line
        for (let x = SAFE_AREA.LEFT; x < SAFE_AREA.LEFT + sigLineLength; x += 4) {
            page.drawLine({ start: { x, y: lineY }, end: { x: x + 2, y: lineY }, thickness: 0.5, color: rgb(0, 0, 0) });
        }

        // 1. Referee Signature (Signature URL)
        if (signatureUrl && typeof signatureUrl === 'string' && signatureUrl.trim() !== '') {
            try {
                let sigImage;
                if (signatureUrl.startsWith('data:image/png;base64,')) {
                    sigImage = await pdfDoc.embedPng(Buffer.from(signatureUrl.split(',')[1], 'base64'));
                } else {
                    const resp = await fetch(signatureUrl);
                    sigImage = await pdfDoc.embedPng(new Uint8Array(await resp.arrayBuffer()));
                }
                const targetWidth = 90;
                const targetHeight = (sigImage.height / sigImage.width) * targetWidth;
                page.drawImage(sigImage, { x: SAFE_AREA.LEFT + 10, y: lineY - 12, width: targetWidth, height: targetHeight });
            } catch (err) { console.error('Referee Sig fail:', err); }
        }

        // 2. Principal Signature (if approved)
        if (PRINCIPAL_SIGNATURE_URL && typeof PRINCIPAL_SIGNATURE_URL === 'string') {
            try {
                let pSigImage;
                if (PRINCIPAL_SIGNATURE_URL.startsWith('data:image/png;base64,')) {
                    pSigImage = await pdfDoc.embedPng(Buffer.from(PRINCIPAL_SIGNATURE_URL.split(',')[1], 'base64'));
                } else {
                    const resp = await fetch(PRINCIPAL_SIGNATURE_URL);
                    pSigImage = await pdfDoc.embedPng(new Uint8Array(await resp.arrayBuffer()));
                }
                const targetWidth = 90;
                const targetHeight = (pSigImage.height / pSigImage.width) * targetWidth;
                // Offset slightly from referee signature
                page.drawImage(pSigImage, { x: SAFE_AREA.LEFT + 60, y: lineY - 12, width: targetWidth, height: targetHeight });
            } catch (err) { console.error('Principal Sig fail:', err); }
        }

        // 3. Principal Stamp (if approved)
        if (PRINCIPAL_STAMP_URL && typeof PRINCIPAL_STAMP_URL === 'string') {
            try {
                let stampImage;
                if (PRINCIPAL_STAMP_URL.startsWith('data:image/png;base64,')) {
                    stampImage = await pdfDoc.embedPng(Buffer.from(PRINCIPAL_STAMP_URL.split(',')[1], 'base64'));
                } else {
                    const resp = await fetch(PRINCIPAL_STAMP_URL);
                    stampImage = await pdfDoc.embedPng(new Uint8Array(await resp.arrayBuffer()));
                }
                const stampWidth = 120;
                const stampHeight = (stampImage.height / stampImage.width) * stampWidth;

                // Bring stamp a little closer to the signature (to the left)
                // x = 335
                page.drawImage(stampImage, {
                    x: 335,
                    y: 90,
                    width: stampWidth,
                    height: stampHeight,
                    opacity: 0.85
                });
            } catch (err) { console.error('Stamp fail:', err); }
        }

        currentY = lineY - 20;
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
            'Content-Disposition': `attachment; filename="Sports Recommendation - ${firstName} ${lastName}.pdf"`,
            'Content-Length': pdfBytes.length,
        });
        res.end(Buffer.from(pdfBytes));

    } catch (error: any) {
        console.error('PDF error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
}
