import { describe, expect, it } from "vitest";
import {
  averageRating,
  offerState,
  parseOffer,
  parseOpening,
  parseProbationReview,
  parseTemplate,
  preboardingProgress,
  probationState,
  stageMoves,
} from "./logic";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe("hiring forms", () => {
  it("HIR-01: an opening needs a title and a salary range in order", () => {
    const bad = parseOpening(
      form({
        title: "",
        employment_type: "full_time",
        pay_model: "monthly",
        status: "open",
        salary_min: "5000",
        salary_max: "4000",
      }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.errors).toMatchObject({
        title: "required",
        salary_max: "rangeOrder",
      });
    const ok = parseOpening(
      form({
        title: "OT",
        employment_type: "full_time",
        pay_model: "monthly",
        status: "open",
        salary_min: "3,500",
        salary_max: "",
      }),
    );
    expect(ok.ok && ok.values.salary_min).toBe("3500.00");
  });

  const offer = {
    job_title: "Speech-Language Therapist",
    employment_type: "full_time",
    pay_model: "monthly",
    basic_salary: "4500",
    normal_hours_per_day: "8",
    work_days_per_week: "5.5",
    start_date: "2026-12-01",
    probation_months: "3",
    letter_locale: "ms",
  };

  it("HIR-03: an offer keeps only the rate for its pay model", () => {
    const parsed = parseOffer(form({ ...offer, hourly_rate: "50" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.values).toMatchObject({
        basic_salary: "4500.00",
        hourly_rate: null,
        locale: "ms",
        probation_months: 3,
      });
    }
    const missing = parseOffer(form({ ...offer, pay_model: "per_session" }));
    expect(!missing.ok && missing.errors.session_rate).toBe("rateRequired");
  });

  it("HIR-03: contract end after start, probation 0–12 months", () => {
    const parsed = parseOffer(
      form({
        ...offer,
        contract_end_date: "2026-11-30",
        probation_months: "13",
      }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors).toMatchObject({
        contract_end_date: "beforeStart",
        probation_months: "invalidNumber",
      });
  });

  it("HIR-03: a template may only use its own merge fields", () => {
    const bad = parseTemplate(
      form({ title: "Confirmation", body: "Dear {{name}}, {{pay}}" }),
      "confirmation",
    );
    expect(!bad.ok && bad.errors.body).toBe("unknownMergeField");
    const ok = parseTemplate(
      form({
        title: "Confirmation",
        body: "Dear {{name}}\r\n",
        is_draft: "on",
      }),
      "confirmation",
    );
    expect(ok.ok && ok.values).toEqual({
      title: "Confirmation",
      body: "Dear {{name}}",
      is_draft: true,
    });
  });

  it("HIR-07: every criterion rated 1–5; extending needs months", () => {
    const ratings = {
      rating_quality: "4",
      rating_skills: "5",
      rating_reliability: "3",
      rating_teamwork: "4",
      rating_conduct: "5",
    };
    const extend = parseProbationReview(
      form({ ...ratings, comments: "Good", recommendation: "extend" }),
    );
    expect(!extend.ok && extend.errors.extend_months).toBe("required");
    const missing = parseProbationReview(
      form({
        ...ratings,
        rating_conduct: "6",
        comments: "",
        recommendation: "confirm",
      }),
    );
    expect(!missing.ok && missing.errors).toMatchObject({
      rating_conduct: "invalidNumber",
      comments: "required",
    });
    const ok = parseProbationReview(
      form({
        ...ratings,
        comments: "Good",
        recommendation: "confirm",
        extend_months: "2",
      }),
    );
    expect(ok.ok && ok.values).toMatchObject({
      recommendation: "confirm",
      extend_months: null,
    });
    if (ok.ok) expect(averageRating(ok.values.ratings)).toBe("4.2");
  });
});

describe("hiring status rules", () => {
  it("HIR-02: Hired only through conversion; accepted candidates can only be rejected", () => {
    expect(stageMoves("applied", false)).toEqual([
      "interview",
      "offer",
      "rejected",
    ]);
    expect(stageMoves("offer", true)).toEqual(["rejected"]);
    expect(stageMoves("hired", true)).toEqual([]);
  });

  it("HIR-04: a sent offer past its date is expired", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(
      offerState({ status: "sent", expires_at: "2026-11-18T10:00:00Z" }, now),
    ).toBe("expired");
    expect(
      offerState({ status: "sent", expires_at: "2026-11-25T10:00:00Z" }, now),
    ).toBe("sent");
    expect(
      offerState(
        { status: "accepted", expires_at: "2026-11-18T10:00:00Z" },
        now,
      ),
    ).toBe("accepted");
  });

  it("HIR-07: probation is due within 30 days, overdue after the end date", () => {
    const record = { probation_end: "2026-12-04", confirmed_on: null };
    expect(probationState(record, null, "2026-10-01").state).toBe(
      "on_probation",
    );
    expect(probationState(record, null, "2026-11-04")).toEqual({
      state: "due",
      daysLeft: 30,
    });
    expect(probationState(record, null, "2026-12-05").state).toBe("overdue");
    expect(
      probationState(
        record,
        { status: "submitted", due_date: "2026-12-04" },
        "2026-11-20",
      ).state,
    ).toBe("review_submitted");
    expect(
      probationState(
        { ...record, confirmed_on: "2026-12-04" },
        null,
        "2026-12-10",
      ).state,
    ).toBe("confirmed");
    expect(probationState(null, null, "2026-11-04").state).toBe("none");
  });

  it("HIR-04: pre-boarding is complete when every required step is in", () => {
    const employee = {
      id_no_last4: "5432",
      date_of_birth: "1995-05-12",
      phone: "012-345 6789",
      address: "Kuala Lumpur",
      emergency_contact: { name: "Mak", phone: "013-111 2222" },
      pcb_category: "single",
    };
    const ctx = {
      offer: { status: "accepted" },
      employee,
      bank: { bank_code: "MBB", account_no_last4: "1234", holder_name: "AINA" },
      required: [
        { credential_type_id: "a", requirement: "mandatory" },
        { credential_type_id: "b", requirement: "optional" },
      ],
      credentials: [{ credential_type_id: "a", status: "pending" }],
    } as unknown as Parameters<typeof preboardingProgress>[0];
    expect(Object.values(preboardingProgress(ctx)).every(Boolean)).toBe(true);
    const draftOnly = {
      ...ctx,
      credentials: [{ credential_type_id: "a", status: "draft" }],
    } as unknown as typeof ctx;
    expect(preboardingProgress(draftOnly).credentials).toBe(false);
    const noBank = { ...ctx, bank: null };
    expect(preboardingProgress(noBank).bank).toBe(false);
  });
});
