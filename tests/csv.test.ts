import { describe, expect, it } from "vitest";
import { CsvParseError, defaultLeadMapping, parseCsv, reviewLeadCsv } from "../src/domain/csv";

describe("CSV import review", () => {
  it("parses quoted fields and detects common lead columns", () => {
    const table = parseCsv(
      '\uFEFFEmail Address,First Name,Company\r\nperson@example.com,Ada,"Analytical, Engines"\r\n',
    );
    const mapping = defaultLeadMapping(table.headers);
    const review = reviewLeadCsv(table, mapping);

    expect(mapping).toEqual({ email: 0, firstName: 1, company: 2 });
    expect(review.rows[0]).toMatchObject({
      line: 2,
      status: "valid",
      contact: { email: "person@example.com", firstName: "Ada", company: "Analytical, Engines" },
    });
    expect(review.counts).toEqual({ total: 1, valid: 1, invalid: 0, duplicate: 0 });
  });

  it("marks invalid and normalized duplicate addresses before import", () => {
    const table = parseCsv("email,firstName\nnot-an-email,Nope\nPerson@Example.com,Ada\nperson@example.com,Duplicate");
    const review = reviewLeadCsv(table, { email: 0, firstName: 1 });

    expect(review.rows.map((row) => ({ status: row.status, issue: row.issue }))).toEqual([
      { status: "invalid", issue: "Invalid email address" },
      { status: "valid", issue: undefined },
      { status: "duplicate", issue: "Duplicate in this file" },
    ]);
    expect(review.contacts).toEqual([{ email: "person@example.com", firstName: "Ada" }]);
  });

  it("requires an email mapping", () => {
    const table = parseCsv("Name,Company\nAda,Example");

    expect(() => reviewLeadCsv(table, {})).toThrowError(
      new CsvParseError("Choose the column that contains email addresses."),
    );
  });

  it("rejects an unfinished quoted field", () => {
    expect(() => parseCsv('email,company\nperson@example.com,"Unfinished')).toThrowError(
      new CsvParseError("The CSV ends inside a quoted field."),
    );
  });

  it("rejects quotes inside an unquoted field", () => {
    expect(() => parseCsv('email,company\nperson@example.com,Acme"North')).toThrowError(
      new CsvParseError("The CSV has an invalid quoted field on line 2."),
    );
  });

  it("rejects characters after a closing quote", () => {
    expect(() => parseCsv('email,company\nperson@example.com,"Acme"North')).toThrowError(
      new CsvParseError("The CSV has an invalid quoted field on line 2."),
    );
  });
});
