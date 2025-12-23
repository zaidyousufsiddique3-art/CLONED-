
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

        // Intro
        const introText = "This document serves as an official confirmation that the following facility booking request has been reviewed and approved by the Sports Coordination Department.";
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

        currentY = drawWrappedText(introText, leftX, currentY, boxWidth, font, fontSize);
        currentY -= 20;

        // Booking Details Header
        page.drawText("Booking Details", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 20;

        // Details
        const details = [
            `Facility Booked: ${payload.facility}`,
            `Date: ${payload.date}`,
            `Time: ${payload.time}`, // Expecting "Start - End" passed from payload
            `Person-in-Charge: ${payload.personInCharge}`,
            `Booking Reference: ${payload.bookingRef || 'N/A'}`
        ];

        for (const det of details) {
            page.drawText(det, { x: leftX, y: currentY, size: 10, font: font }); // Removed extra indent
            currentY -= 15;
        }
        currentY -= 20;

        // Approval Status Header
        page.drawText("Approval Status", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 20;

        currentY = drawWrappedText("This booking has been officially approved and confirmed.", leftX, currentY, boxWidth, font, fontSize);
        currentY -= 5;
        currentY = drawWrappedText("The facility has been reserved exclusively for the date and time stated above.", leftX, currentY, boxWidth, font, fontSize);
        currentY -= 20;

        // Terms Header
        page.drawText("Terms & Conditions", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 20;

        // Strict Word-for-Word T&Cs (No numbers)
        const terms = [
            "The person-in-charge must arrive within 20 minutes of the scheduled start time.",
            "Failure to do so will result in automatic cancellation of the booking.",
            "The facility must be used strictly for its intended purpose.",
            "Any damage to the facility or equipment will be the responsibility of the booking party.",
            "The facility must be vacated immediately at the end of the approved booking time."
        ];

        for (const t of terms) {
            currentY = drawWrappedText(t, leftX, currentY, boxWidth, font, fontSize); // Removed extra indent
            currentY -= 5; // Tighter spacing for list feel
        }
        currentY -= 30;

        // Authorization
        page.drawText("Authorization", { x: leftX, y: currentY, size: 12, font: fontBold });
        currentY -= 20;
        page.drawText("Authorized by Sports Coordinator", { x: leftX, y: currentY, size: 10, font: font });
        currentY -= 15;
        page.drawText("This is a system-generated confirmation document. No physical signature or stamp is required.", { x: leftX, y: currentY, size: 10, font: font }); // Removed color to ensure no 'restyling' complaints

        // Footer (Bottom of page)
        const footerY = 50;
        page.drawText("Generated automatically by the Facilities Booking System", { x: leftX, y: footerY + 24, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });
        page.drawText("This document is valid only for the approved date and time", { x: leftX, y: footerY + 12, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });
        page.drawText("A downloaded copy is considered an official confirmation", { x: leftX, y: footerY, size: 8, font: font, color: rgb(0.5, 0.5, 0.5) });

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
