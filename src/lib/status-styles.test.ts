import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";
import {
  categoryTones,
  payrollSteps,
  statusTones,
  toneClasses,
  type StatusDomain,
} from "./status-styles";

const domains = Object.keys(statusTones) as StatusDomain[];

describe("status-styles", () => {
  it("covers every status family the spec names", () => {
    expect(domains.sort()).toEqual(
      [
        "bankAccount",
        "changeRequest",
        "checklist",
        "claim",
        "cpd",
        "credential",
        "employee",
        "leave",
        "membership",
        "ot",
        "payroll",
        "policy",
      ].sort(),
    );
  });

  it("gives every status a label in English and Bahasa Malaysia", () => {
    for (const messages of [en, ms]) {
      for (const domain of domains) {
        for (const status of Object.keys(statusTones[domain])) {
          const labels = messages.Status[domain] as Record<string, string>;
          expect(labels[status], `${domain}.${status}`).toBeTruthy();
        }
      }
      for (const category of Object.keys(categoryTones)) {
        expect(
          (messages.Category as Record<string, string>)[category],
        ).toBeTruthy();
      }
    }
  });

  it("matches the chip colours in ui-system.md §4", () => {
    expect(statusTones.credential.valid).toBe("primary");
    expect(statusTones.credential.pending).toBe("info");
    expect(statusTones.credential.expiring_soon).toBe("warning");
    expect(statusTones.credential.expired).toBe("danger");
    expect(statusTones.credential.missing).toBe("neutral");
    expect(statusTones.credential.upcoming).toBe("info");
    expect(statusTones.credential.rejected).toBe("danger");
    expect(categoryTones).toEqual({
      credential: "info",
      leave: "primary",
      claim: "primary",
      overtime: "warning",
      bank_change: "danger",
      profile_change: "info",
    });
  });

  it("lists the 6 payroll states in run order", () => {
    expect(payrollSteps).toEqual(Object.keys(statusTones.payroll));
    expect(payrollSteps).toHaveLength(6);
  });

  it("has classes for every tone", () => {
    for (const domain of domains) {
      for (const tone of Object.values(statusTones[domain])) {
        expect(toneClasses[tone]).toMatch(/^bg-\S+ text-\S+$/);
      }
    }
  });
});
