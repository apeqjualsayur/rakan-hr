// Letter PDFs (HIR-03, HIR-07) and the candidate's signature page (HIR-08), drawn with
// pdf-lib on A4. The standard PDF fonts cover Latin-1, which is enough for English and
// Malay; anything else is shown as "?".

import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "npm:pdf-lib@1.17.1";
import { type LetterLocale, parseBlocks } from "./merge.ts";

const INK = hex("#1E2A24");
const MUTED = hex("#5B6B62");
const PRIMARY = hex("#1E6B52");
const DANGER = hex("#B3261E");

const PAGE: [number, number] = [595, 842];
const MARGIN = 64;
const WIDTH = PAGE[0] - 2 * MARGIN;

function hex(value: string) {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function safe(font: PDFFont, text: string) {
  return [...text]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    })
    .join("");
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
  for (let word of safe(font, text).split(/\s+/).filter(Boolean)) {
    while (!fits(word) && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && !fits(word.slice(0, cut))) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (fits(next) || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DRAFT_TEXT: Record<LetterLocale, string> = {
  en: "DRAFT - placeholder wording, not reviewed by a lawyer. Do not use for a real hire.",
  ms: "DRAF - teks sementara, belum disemak oleh peguam. Jangan gunakan untuk pengambilan sebenar.",
};

export type LetterSection = {
  /** Filled template text (merge fields already replaced). */
  text: string;
  draft: boolean;
};

/**
 * One PDF from one or more letters (the offer letter, then the contract on a new page).
 * Every page shows the company name; draft letters are stamped DRAFT on every page.
 */
export async function renderLetters(
  sections: readonly LetterSection[],
  options: { companyName: string; locale: LetterLocale; documentTitle: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(options.documentTitle);
  pdf.setCreator("Rakan");
  pdf.setProducer("Rakan");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draftPages = new Set<PDFPage>();

  for (const section of sections) {
    let page = pdf.addPage(PAGE);
    if (section.draft) draftPages.add(page);
    let y = PAGE[1] - MARGIN;

    const header = () => {
      page.drawText(safe(bold, options.companyName), {
        x: MARGIN,
        y,
        size: 10,
        font: bold,
        color: PRIMARY,
      });
      y -= 30;
    };
    const ensure = (height: number) => {
      if (y - height >= MARGIN + 24) return;
      page = pdf.addPage(PAGE);
      if (section.draft) draftPages.add(page);
      y = PAGE[1] - MARGIN;
      header();
    };
    const lines = (
      text: string,
      size: number,
      f: PDFFont,
      colour = INK,
      indent = 0,
      after = 0,
    ) => {
      const wrapped = wrap(f, text, size, WIDTH - indent);
      wrapped.forEach((line, i) => {
        ensure(size + 5);
        page.drawText(line, {
          x: MARGIN + indent,
          y,
          size,
          font: f,
          color: colour,
        });
        y -= size + 5;
        if (i === wrapped.length - 1) y -= after;
      });
    };

    header();
    for (const block of parseBlocks(section.text)) {
      if (block.type === "title") {
        ensure(40);
        lines(block.text, 18, bold, INK, 0, 10);
      } else if (block.type === "heading") {
        ensure(40);
        y -= 4;
        lines(block.text, 12, bold, INK, 0, 4);
      } else if (block.type === "bullet") {
        ensure(16);
        page.drawText("-", { x: MARGIN + 4, y, size: 11, font, color: INK });
        lines(block.text, 11, font, INK, 16, 3);
      } else {
        for (const line of block.text.split("\n")) lines(line, 11, font);
        y -= 8;
      }
    }
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`${index + 1} / ${pages.length}`, {
      x: PAGE[0] - MARGIN - 30,
      y: MARGIN - 28,
      size: 8,
      font,
      color: MUTED,
    });
    if (!draftPages.has(page)) return;
    page.drawText("DRAFT", {
      x: 150,
      y: 300,
      size: 120,
      font: bold,
      color: DANGER,
      opacity: 0.07,
      rotate: degrees(45),
    });
    const banner = wrap(font, DRAFT_TEXT[options.locale], 8, WIDTH);
    banner.forEach((line, i) => {
      page.drawText(line, {
        x: MARGIN,
        y: PAGE[1] - 30 - i * 11,
        size: 8,
        font: bold,
        color: DANGER,
      });
    });
  });
  return pdf.save();
}

export type SignatureRecord = {
  documentTitle: string;
  typedName: string;
  email: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  sha256: string;
  signatureId: string;
  consent: string;
};

/**
 * HIR-08: the same signature page as POL-03 (src/lib/policies/sign.ts) appended to the
 * exact offer PDF the candidate saw.
 */
export async function appendSignaturePage(
  original: Uint8Array,
  record: SignatureRecord,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const left = 56;
  const width = 595 - 2 * left;
  let y = 842 - 72;
  const text = (value: string, size: number, f = font, colour = INK) => {
    for (const line of wrap(f, value, size, width)) {
      page.drawText(line, { x: left, y, size, font: f, color: colour });
      y -= size + 5;
    }
  };
  const field = (label: string, value: string) => {
    text(label, 9, bold, MUTED);
    text(value, 11);
    y -= 8;
  };
  const at = record.signedAt;
  const myt = new Date(at.getTime() + 8 * 3600 * 1000);
  const stamp = `${myt.toISOString().slice(0, 10)} ${myt.toISOString().slice(11, 16)} (Malaysia time) · ${at.toISOString()}`;

  page.drawText("rakan", { x: left, y, size: 16, font: bold, color: PRIMARY });
  y -= 36;
  text("Signature record / Rekod tandatangan", 18, bold);
  y -= 10;
  field("Document / Dokumen", record.documentTitle);
  field("Signed by (typed name) / Ditandatangani oleh", record.typedName);
  field("Candidate email / E-mel calon", record.email);
  field("Signed at / Ditandatangani pada", stamp);
  field("IP address / Alamat IP", record.ip);
  field("Device / Peranti", record.userAgent);
  field("Document fingerprint (SHA-256) / Cap jari dokumen", record.sha256);
  field("Signature ID / ID tandatangan", record.signatureId);
  text("Consent / Persetujuan", 9, bold, MUTED);
  text(safe(font, record.consent), 11);
  y -= 16;
  text(
    "The fingerprint identifies the exact document signed: the pages before this one. Any change to them gives a different fingerprint.",
    8,
    font,
    MUTED,
  );
  return pdf.save();
}
