import { describe, it, expect } from "vitest";
import { usualDoctorId } from "./usualDoctor";

/** Local-time ISO, so the test means the same thing wherever it runs. */
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

const DR_VINDHYA = "e82d048f-9a27-4e5b-91ff-ad9da4ff0c68";
const DR_PUNYA = "7017b1e5-434d-422d-92ec-1ae4fd941426";
const DR_LEFT = "11111111-1111-1111-1111-111111111111";

const ON_STAFF = [DR_VINDHYA, DR_PUNYA];

describe("usualDoctorId", () => {
  it("takes the doctor from the most recent visit", () => {
    expect(
      usualDoctorId(
        [
          { start_time: at(2026, 6, 12), staff_id: DR_PUNYA },
          { start_time: at(2026, 9, 29), staff_id: DR_VINDHYA },
          { start_time: at(2026, 8, 3), staff_id: DR_PUNYA },
        ],
        ON_STAFF,
      ),
    ).toBe(DR_VINDHYA);
  });

  it("skips a visit that recorded no doctor and uses the next that did", () => {
    expect(
      usualDoctorId(
        [
          { start_time: at(2026, 9, 29), staff_id: null },
          { start_time: at(2026, 9, 20), staff_id: DR_PUNYA },
        ],
        ON_STAFF,
      ),
    ).toBe(DR_PUNYA);
  });

  it("ignores a doctor who has left rather than pre-selecting one the list cannot show", () => {
    expect(
      usualDoctorId(
        [
          { start_time: at(2026, 9, 29), staff_id: DR_LEFT },
          { start_time: at(2026, 9, 20), staff_id: DR_VINDHYA },
        ],
        ON_STAFF,
      ),
    ).toBe(DR_VINDHYA);
  });

  it("leaves the field blank for a patient who has never been seen", () => {
    expect(usualDoctorId([], ON_STAFF)).toBeNull();
    expect(usualDoctorId(null, ON_STAFF)).toBeNull();
    expect(usualDoctorId([{ start_time: at(2026, 9, 29), staff_id: DR_LEFT }], ON_STAFF)).toBeNull();
  });

  it("says nothing before the staff list has loaded", () => {
    expect(usualDoctorId([{ start_time: at(2026, 9, 29), staff_id: DR_VINDHYA }], [])).toBeNull();
  });

  it("ignores a visit whose date cannot be read", () => {
    expect(
      usualDoctorId(
        [
          { start_time: "not a date", staff_id: DR_PUNYA },
          { start_time: at(2026, 9, 20), staff_id: DR_VINDHYA },
        ],
        ON_STAFF,
      ),
    ).toBe(DR_VINDHYA);
  });
});
