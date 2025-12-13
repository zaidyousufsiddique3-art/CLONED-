import { generateExpectedGradePdf, ExpectedGradePdfPayload } from '../src/pdf/generateExpectedGradePdf.js';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const payload: ExpectedGradePdfPayload = req.body;

        console.log("PDFLIB PIPELINE EXECUTED"); // Verification Marker

        const pdfBuffer = await generateExpectedGradePdf(payload);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Expected_Grade_Sheet_${Date.now()}.pdf`);
        res.status(200).send(pdfBuffer);

    } catch (error: any) {
        console.error('Error in PDF generation API:', error);
        res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
}
