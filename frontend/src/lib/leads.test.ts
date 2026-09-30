import { describe, expect, it } from "vitest";
import { isEmail, mergeRecipients, parseLeads } from "./leads";

describe("parseLeads", () => {
  it("extracts emails from a CSV with headers and other columns", () => {
    const csv = "name,email,company\nJohn,john@acme.com,Acme\nJane,JANE@corp.io,Corp\n";
    expect(parseLeads(csv)).toEqual(["john@acme.com", "jane@corp.io"]);
  });

  it("handles plain text lists, deduplicating case-insensitively", () => {
    expect(parseLeads("a@x.com\nb@y.org; A@X.com  c@z.co")).toEqual(["a@x.com", "b@y.org", "c@z.co"]);
  });

  it("ignores rows without an email", () => {
    expect(parseLeads("name\nnobody\n,,,\n")).toEqual([]);
  });
});

describe("helpers", () => {
  it("validates single addresses", () => {
    expect(isEmail("x@y.com")).toBe(true);
    expect(isEmail("not an email")).toBe(false);
  });

  it("merges without duplicates", () => {
    expect(mergeRecipients(["a@x.com"], ["A@x.com", "b@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });
});
