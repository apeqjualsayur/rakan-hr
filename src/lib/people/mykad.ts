// EMP-02 MyKad parsing. A MyKad number is YYMMDD-PB-###G (12 digits):
//   YYMMDD  date of birth
//   PB      place of birth (state code, or a country / region code for those born abroad)
//   ###G    serial; the last digit is odd for males and even for females.
// The database also refuses a MyKad that is not 12 digits (employees_before_write).

export type MyKadProblem = "format" | "date" | "placeOfBirth";

export type MyKad = {
  /** "010203145678" */
  digits: string;
  /** "010203-14-5678" */
  formatted: string;
  /** "YYYY-MM-DD" */
  dateOfBirth: string;
  gender: "male" | "female";
  placeOfBirthCode: string;
};

// Place-of-birth codes the National Registration Department has never issued.
// Everything else is a Malaysian state (01–16, 21–59) or a country / region code.
const UNUSED_PLACE_CODES = new Set([
  0, 17, 18, 19, 20, 69, 70, 73, 80, 81, 94, 95, 96, 97,
]);

/** Digits only; dashes and spaces are allowed in what people type. */
export function mykadDigits(input: string) {
  return input.replace(/[\s-]/g, "");
}

export function formatMyKad(digits: string) {
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/**
 * The two-digit year is read as 20YY unless that date is still in the future, then 19YY.
 * `today` is "YYYY-MM-DD" (malaysiaToday()), injectable for tests.
 */
export function parseMyKad(
  input: string,
  today: string,
): { ok: true; value: MyKad } | { ok: false; problem: MyKadProblem } {
  const digits = mykadDigits(input);
  if (!/^\d{12}$/.test(digits)) return { ok: false, problem: "format" };

  const yy = Number(digits.slice(0, 2));
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const in2000s = `${2000 + yy}-${mm}-${dd}`;
  const year = in2000s > today ? 1900 + yy : 2000 + yy;
  const dateOfBirth = `${year}-${mm}-${dd}`;
  if (!isRealDate(dateOfBirth)) return { ok: false, problem: "date" };

  const place = Number(digits.slice(6, 8));
  if (UNUSED_PLACE_CODES.has(place))
    return { ok: false, problem: "placeOfBirth" };

  return {
    ok: true,
    value: {
      digits,
      formatted: formatMyKad(digits),
      dateOfBirth,
      gender: Number(digits[11]) % 2 === 1 ? "male" : "female",
      placeOfBirthCode: digits.slice(6, 8),
    },
  };
}

function isRealDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso);
}
