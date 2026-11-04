/**
 * Is this patient one the front desk must recognise on arrival?
 *
 * One line, but it is read from five places - the patients list in each of its
 * four display modes, and the appointment screens - and the rows reaching some
 * of them are typed `any`, because the generic list views are shared with
 * Billing, Leads and Procedures and take whatever each page fetches.
 *
 * So the check is strict. A row fetched without the column reads as NOT a VIP
 * rather than as `undefined` quietly behaving like one. A crown that should not
 * be there sends the desk fussing over somebody who is not a VIP, which is
 * worse than one that is merely missing - the same reasoning the appointment
 * side already used, now shared with it rather than written twice.
 *
 * Not to be confused with the engagement tier: that is computed from visits and
 * spend, this is a judgement somebody made on purpose.
 */

export interface VipFlagged {
  is_vip?: boolean | null;
}

export function isVipPatient(row: VipFlagged | null | undefined): boolean {
  return row?.is_vip === true;
}
