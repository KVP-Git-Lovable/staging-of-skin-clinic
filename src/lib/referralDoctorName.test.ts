import { describe, it, expect } from "vitest";
import {
  contactsByDoctorKey,
  doctorNameKey,
  groupByDoctor,
  preferredDoctorSpelling,
} from "./referralDoctorName";

/**
 * Referring doctors are typed by hand at the front desk, so one doctor
 * arrives under several spellings. The two in this clinic's live data:
 *
 *   "Dr Gaurav shetty" / "Dr. Gaurav Shetty"  - 48 patients, Rs 2.70 lakh
 *   "DR MALCOLM PINTO" / "Dr. Malcolm Pinto"  - 4 patients, Rs 72,618
 *
 * Each became its own line on the Doctor Referrals report holding part of
 * the money, so a doctor who sends real work looked like he had sent almost
 * none.
 */
describe("doctorNameKey", () => {
  it("gives the clinic's two split doctors one key each", () => {
    expect(doctorNameKey("Dr Gaurav shetty")).toBe(doctorNameKey("Dr. Gaurav Shetty"));
    expect(doctorNameKey("DR MALCOLM PINTO")).toBe(doctorNameKey("Dr. Malcolm Pinto"));
  });

  it("ignores the title, the case, the dots and the spacing", () => {
    const key = doctorNameKey("Dr. Gaurav Shetty");
    expect(doctorNameKey("gaurav shetty")).toBe(key);
    expect(doctorNameKey("  Doctor   Gaurav  Shetty  ")).toBe(key);
    expect(doctorNameKey("DR.GAURAV.SHETTY")).toBe(key);
  });

  it("KEEPS a difference of one letter, because that may be two people", () => {
    // Live data has both of these. Merging them would be a worse error than
    // listing one doctor twice: fuzzy matching belongs behind a human.
    expect(doctorNameKey("Dr Sricharith Shetty")).not.toBe(doctorNameKey("Dr. Shricharith Shetty"));
  });

  it("does NOT eat the start of a name that merely begins with a title", () => {
    // Drishti, Draupadi and Mrinal are all on this clinic's books. A title
    // stripper without a boundary turns Dr Drishti into "ishti" and quietly
    // merges her with anyone else whose name ends that way.
    expect(doctorNameKey("Drishti")).toBe("drishti");
    expect(doctorNameKey("Dr Drishti")).toBe("drishti");
    expect(doctorNameKey("Draupadi Rao")).toBe("draupadirao");
    expect(doctorNameKey("Mrinal")).toBe("mrinal");
    expect(doctorNameKey("Dr Shilpa mrinal")).toBe("shilpamrinal");
  });

  it("does not confuse two different doctors who share a surname", () => {
    expect(doctorNameKey("Dr Gaurav Shetty")).not.toBe(doctorNameKey("Dr Vijetha Shetty"));
  });

  it("has nothing to say about nothing", () => {
    expect(doctorNameKey("")).toBe("");
    expect(doctorNameKey(null)).toBe("");
    expect(doctorNameKey(undefined)).toBe("");
    expect(doctorNameKey("   ")).toBe("");
    // A title and nothing else is not a doctor's name.
    expect(doctorNameKey("Dr.")).toBe("");
  });
});

describe("preferredDoctorSpelling", () => {
  it("prefers the spelling that reads like a doctor's name", () => {
    expect(preferredDoctorSpelling(["gaurav shetty", "Dr. Gaurav Shetty"])).toBe("Dr. Gaurav Shetty");
  });

  it("prefers proper case over SHOUTING", () => {
    expect(preferredDoctorSpelling(["DR MALCOLM PINTO", "Dr. Malcolm Pinto"])).toBe("Dr. Malcolm Pinto");
  });

  it("does not depend on the order the rows arrived in", () => {
    const a = preferredDoctorSpelling(["Dr Gaurav shetty", "Dr. Gaurav Shetty"]);
    const b = preferredDoctorSpelling(["Dr. Gaurav Shetty", "Dr Gaurav shetty"]);
    expect(a).toBe(b);
  });

  it("returns nothing when nothing was ever written", () => {
    expect(preferredDoctorSpelling([])).toBe("");
    expect(preferredDoctorSpelling(["", "  "])).toBe("");
  });
});

describe("groupByDoctor", () => {
  const ROWS = [
    { name: "Dr Gaurav shetty", billed: 100 },
    { name: "Dr. Gaurav Shetty", billed: 250 },
    { name: "Dr. Malcolm Pinto", billed: 40 },
    { name: "", billed: 9000 },
    { name: null, billed: 1000 },
  ];

  it("puts both spellings of one doctor on one line, with all the money", () => {
    const g = groupByDoctor(ROWS, (r) => r.name);
    const gaurav = g.get(doctorNameKey("Dr Gaurav Shetty"));
    expect(gaurav?.rows).toHaveLength(2);
    expect(gaurav?.rows.reduce((s, r) => s + r.billed, 0)).toBe(350);
    expect(gaurav?.display).toBe("Dr. Gaurav Shetty");
  });

  it("KEEPS the referrals with no doctor recorded", () => {
    // 397 of this clinic's 561 referrals name nobody, carrying Rs 27.5 lakh.
    // A report that silently dropped them would understate everything.
    const unknown = groupByDoctor(ROWS, (r) => r.name).get("");
    expect(unknown?.rows).toHaveLength(2);
    expect(unknown?.rows.reduce((s, r) => s + r.billed, 0)).toBe(10000);
    expect(unknown?.display).toBe("");
  });

  it("leaves distinct doctors distinct", () => {
    expect(groupByDoctor(ROWS, (r) => r.name).size).toBe(3); // gaurav, malcolm, unknown
  });
});

describe("contactsByDoctorKey", () => {
  it("finds a doctor whose name the patient typed differently", () => {
    const map = contactsByDoctorKey([{ name: "Dr. Gaurav Shetty", phone: "9845012345" }]);
    expect(map.get(doctorNameKey("Dr Gaurav shetty"))?.phone).toBe("9845012345");
  });

  it("keeps the record that actually has a phone", () => {
    // The phone is the entire reason for the lookup, so a duplicate record
    // with one must win over an empty one whichever order they arrive in.
    const withPhone = { name: "Dr Gaurav Shetty", phone: "9845012345" };
    const without = { name: "Dr. Gaurav Shetty", phone: "" };
    expect(contactsByDoctorKey([without, withPhone]).get(doctorNameKey("gaurav shetty"))?.phone).toBe("9845012345");
    expect(contactsByDoctorKey([withPhone, without]).get(doctorNameKey("gaurav shetty"))?.phone).toBe("9845012345");
  });

  it("skips a record with no usable name rather than keying on empty", () => {
    const map = contactsByDoctorKey([{ name: "", phone: "999" }, { name: null, phone: "888" }]);
    expect(map.size).toBe(0);
  });
});
