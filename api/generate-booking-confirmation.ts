
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

export default async function handler(req: any, res: any) {
    try {
        const limiter = createRateLimiter(20, "1 m");
        const ip = getClientIp(req);
        const { success } = await limiter.limit(`pdf_booking:${ip}`);

        if (!success) {
            return res.status(429).json({ error: "Rate limit exceeded." });
        }
    } catch (err) {
        // Fallback if rate limit fails, continue
        console.error("Rate limit error:", err);
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload = await parseBody(req);

        // 1. Load Letterhead
        const letterheadPath = path.join(process.cwd(), "assets", "expected-grade-letterhead.pdf");

        if (!fs.existsSync(letterheadPath)) {
            throw new Error("Letterhead template not found server-side.");
        }

        const letterheadBytes = fs.readFileSync(letterheadPath);
        const pdfDoc = await PDFDocument.load(letterheadBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const page = pdfDoc.getPages()[0];

        const fontSize = 10;
        const startY = 650; // Start below header
        let currentY = startY;
        const leftX = 70;
        const rightX = 525;
        const centerX = (leftX + rightX) / 2;

        // Title
        const title = "FACILITY BOOKING APPROVAL CONFIRMATION";
        const titleWidth = fontBold.widthOfTextAtSize(title, 14);
        page.drawText(title, {
            x: centerX - (titleWidth / 2),
            y: currentY,
            size: 14,
            font: fontBold,
            color: rgb(0, 0, 0)
        });
        currentY -= 40;

        // Simple wrapping helper
        const boxWidth = rightX - leftX;

        // Simple wrapping helper
        function drawWrappedText(text: string, x: number, lineY: number, maxWidth: number, f: any, s: number) {
            const words = text.split(' ');
            let line = '';
            let y = lineY;
            for (const w of words) {
                const testLine = line + w + ' ';
                const width = f.widthOfTextAtSize(testLine, s);
                if (width > maxWidth && line !== '') {
                    page.drawText(line, { x, y, size: s, font: f });
                    line = w + ' ';
                    y -= 15;
                } else {
                    line = testLine;
                }
            }
            page.drawText(line, { x, y, size: s, font: f });
            return y - 15;
        }

        currentY -= 20;

        // 1. Intro Text
        const introText = "This document serves as an official confirmation that the following facility booking request has been reviewed and approved by the Sports Coordination Department.";
        currentY = drawWrappedText(introText, leftX, currentY, boxWidth, font, fontSize);

        // Section: Booking Details
        currentY -= 24; // 24px above title
        page.drawText("Booking Details", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 12; // 12px below title

        // Bullet point details
        const details = [
            { label: 'Facility', value: payload.facility },
            { label: 'Date', value: payload.date },
            { label: 'Time', value: payload.time },
            { label: 'Gender Category', value: payload.gender || 'N/A' },
            { label: 'Person-in-Charge', value: payload.personInCharge },
            {
                label: 'Total Charges',
                value: payload.paymentMethod === 'Membership' ? 'Paid by Membership' : (payload.price ? payload.price + ' SAR' : 'N/A')
            },
            { label: 'Booking Reference', value: payload.bookingRef || 'N/A' }
        ];

        for (const det of details) {
            page.drawText(`• ${det.label}: ${det.value}`, { x: leftX + 10, y: currentY, size: 10, font: font });
            currentY -= 15;
        }

        // Section: Approval Status
        currentY -= 24;
        page.drawText("Approval Status", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 12;

        // Line 1: Bold keywords
        const line1Part1 = "This booking has been officially ";
        const line1Bold = "approved and confirmed";
        const line1Part2 = ".";

        page.drawText(line1Part1, { x: leftX, y: currentY, size: fontSize, font: font });
        const xl1 = leftX + font.widthOfTextAtSize(line1Part1, fontSize);
        page.drawText(line1Bold, { x: xl1, y: currentY, size: fontSize, font: fontBold });
        const xl2 = xl1 + fontBold.widthOfTextAtSize(line1Bold, fontSize);
        page.drawText(line1Part2, { x: xl2, y: currentY, size: fontSize, font: font });
        currentY -= 15;

        // Line 2: No bold
        page.drawText("The facility has been reserved exclusively for the date and time stated above.", { x: leftX, y: currentY, size: fontSize, font: font });
        currentY -= 15;

        // Terms Header
        currentY -= 24;
        page.drawText("Terms & Conditions", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 12;

        const terms = [
            "1. The person-in-charge must arrive within 20 minutes of the scheduled start time.",
            "2. Failure to do so will result in automatic cancellation of the booking.",
            "3. The facility must be used strictly for its intended purpose.",
            "4. Any damage to the facility or equipment will be the responsibility of the booking party.",
            "5. The facility must be vacated immediately at the end of the approved booking time."
        ];

        for (const t of terms) {
            currentY = drawWrappedText(t, leftX, currentY, boxWidth, font, fontSize);
            currentY -= 5;
        }

        // Section: Authorized By
        currentY -= 35; // Positioned upward
        page.drawText("Authorized by", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 10;

        // 1. Signature Image (Above Line)
        const sigPath = path.join(process.cwd(), "assets", "sports-coordinator-sig.png");
        let sigH = 40;
        if (fs.existsSync(sigPath)) {
            try {
                const sigBytes = fs.readFileSync(sigPath);
                const sigImage = await pdfDoc.embedPng(sigBytes);
                const targetW = 100;
                sigH = (sigImage.height / sigImage.width) * targetW;

                page.drawImage(sigImage, {
                    x: leftX + 10,
                    y: currentY - sigH + 10, // Slight overlap
                    width: targetW,
                    height: sigH,
                });
            } catch (err) {
                console.error("Sig embed error:", err);
            }
        }
        currentY -= (sigH - 5);

        // 2. Dotted Line
        const sigLineLength = 200;
        const lineY = currentY;
        for (let x = leftX; x < leftX + sigLineLength; x += 4) {
            page.drawLine({
                start: { x, y: lineY },
                end: { x: x + 2, y: lineY },
                thickness: 0.5,
                color: rgb(0, 0, 0),
            });
        }

        // 3. Credentials (Below Line)
        currentY = lineY - 15;
        page.drawText("Chandana Kulathunga", { x: leftX, y: currentY, size: 10, font: fontBold });
        currentY -= 12;
        page.drawText("Sports Coordinator", { x: leftX, y: currentY, size: 10, font: font });
        currentY -= 12;
        page.drawText("Sri Lankan International School", { x: leftX, y: currentY, size: 10, font: font });
        currentY -= 12;
        page.drawText("Riyadh, KSA", { x: leftX, y: currentY, size: 10, font: font });

        // Footer: Centered, small, two lines
        const footerY = 60;
        const fLine1 = "Generated automatically by the Facilities Booking System.";
        const fLine2 = "This confirmation is valid only for the approved date and time.";

        const f1W = font.widthOfTextAtSize(fLine1, 8);
        const f2W = font.widthOfTextAtSize(fLine2, 8);

        page.drawText(fLine1, { x: centerX - (f1W / 2), y: footerY + 12, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });
        page.drawText(fLine2, { x: centerX - (f2W / 2), y: footerY, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });

        const pdfBytes = await pdfDoc.save();

        // Format Date to DD-MM-YYYY for filename
        const dateParts = payload.date.split('-'); // Assumes YYYY-MM-DD from HTML input
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : payload.date;

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Facility_Booking_Confirmation_${formattedDate}.pdf"`,
            'Content-Length': pdfBytes.length
        });
        res.end(Buffer.from(pdfBytes));

    } catch (error: any) {
        console.error("PDF Gen Error:", error);
        res.status(500).json({ error: "Failed to generate PDF", details: error.message });
    }
}
