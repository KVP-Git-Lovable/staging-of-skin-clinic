import { assertEquals } from "jsr:@std/assert@1";
import { buildZohoExpenseBody, findAccountIdByName, findVendorId, zohoDescription, zohoFailure } from "./zoho-expense.ts";

const expenseAccounts = [
  { account_id: "A1", account_name: "Consumables" },
  { account_id: "A2", account_name: "Raw Materials And Consumables" },
  { account_id: "A3", account_name: "Office Supplies" },
];
const paidThrough = [
  { account_id: "P1", account_name: "Petty Cash" },
  { account_id: "P2", account_name: "Undeposited Funds" },
];
const exp = { amount: "4500", expense_date: "2026-11-19", title: "Gloves", description: "Box of 100", categoryName: "Consumables" };

Deno.test("category name picks the Zoho account with exactly that name", () => {
  assertEquals(findAccountIdByName(expenseAccounts, "Consumables"), "A1");
  assertEquals(findAccountIdByName(expenseAccounts, "  consumables "), "A1");
});

Deno.test("no similar-name fallback: an unmatched category gets no account id", () => {
  assertEquals(findAccountIdByName(expenseAccounts, "Consumable"), null);
  assertEquals(findAccountIdByName(expenseAccounts, "Supplies"), null);
  assertEquals(findAccountIdByName(expenseAccounts, null), null);
});

Deno.test("unmatched category is sent by name so Zoho refuses it, never another account", () => {
  const body = buildZohoExpenseBody({ ...exp, categoryName: "Lab Kits" }, expenseAccounts, paidThrough, null);
  assertEquals(body.account_id, undefined);
  assertEquals(body.account_name, "Lab Kits");
});

Deno.test("matched expense uses amount, expense date, account id and title + description", () => {
  const body = buildZohoExpenseBody(exp, expenseAccounts, paidThrough, "V1");
  assertEquals(body, {
    date: "2026-11-19",
    amount: 4500,
    description: "Gloves - Box of 100",
    account_id: "A1",
    paid_through_account_id: "P1",
    vendor_id: "V1",
  });
});

Deno.test("description is just the title when there is no description", () => {
  assertEquals(zohoDescription("Gloves", null), "Gloves");
  assertEquals(zohoDescription("Gloves", "  "), "Gloves");
});

Deno.test("vendor matches by exact name only", () => {
  const contacts = [{ contact_id: "V1", contact_name: "Demo Supplies", contact_type: "vendor" }];
  assertEquals(findVendorId(contacts, "demo supplies"), "V1");
  assertEquals(findVendorId(contacts, "Demo Supply"), null);
});

Deno.test("Zoho's own refusal message is returned", () => {
  assertEquals(zohoFailure(400, { code: 4002, message: "Please enter valid expense account" }, ""), "Please enter valid expense account");
  assertEquals(zohoFailure(200, { code: 1001, message: "Something" }, ""), "Something");
  assertEquals(zohoFailure(201, { code: 0, message: "The expense has been created." }, ""), null);
});
