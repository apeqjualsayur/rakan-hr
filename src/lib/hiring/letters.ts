// The letter template engine lives with the `hiring` Edge Function (pure TypeScript, no
// imports), so the editor and tests use the very same rules as the PDFs.
export {
  fillTemplate,
  LETTER_KINDS,
  letterDate,
  MERGE_FIELDS,
  offerValues,
  parseBlocks,
  probationEnd,
  ringgit,
  sampleValues,
  unknownFields,
  type LetterKind,
  type LetterLocale,
} from "../../../supabase/functions/_shared/letters/merge";
