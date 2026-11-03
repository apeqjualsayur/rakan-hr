// DEV ONLY: writes placeholder policy PDFs to test-policies/ so the Step 7 flow can be tried
// before the real documents exist. Every page says TEST. Replace them with the real PDPA
// notice and handbook before go-live. Usage: npm run make:test-policies
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const docs = [
  [
    "PDPA-privacy-notice-TEST.pdf",
    "Privacy notice (PDPA) / Notis privasi",
    "v1",
  ],
  [
    "Employee-handbook-v1-TEST.pdf",
    "Employee handbook / Buku panduan pekerja",
    "v1",
  ],
  [
    "Employee-handbook-v2-TEST.pdf",
    "Employee handbook / Buku panduan pekerja",
    "v2",
  ],
];

mkdirSync("test-policies", { recursive: true });
for (const [file, title, version] of docs) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  page.drawText("TEST - NOT A REAL POLICY", {
    x: 56,
    y: 770,
    size: 20,
    font: bold,
    color: rgb(0.63, 0.16, 0.09),
  });
  page.drawText(title, { x: 56, y: 730, size: 16, font: bold });
  page.drawText(`Placeholder ${version} for trying Rakan's click-to-sign.`, {
    x: 56,
    y: 700,
    size: 12,
    font,
  });
  page.drawText("Upload your real document before staff start using Rakan.", {
    x: 56,
    y: 680,
    size: 12,
    font,
  });
  writeFileSync(`test-policies/${file}`, await pdf.save());
  console.log(`✔ test-policies/${file}`);
}
