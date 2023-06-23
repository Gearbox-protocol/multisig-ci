import { expect, it } from "vitest";

import { getTransactionsToExecute } from "./utils.js";

it("should sort by nonce and dedup", async () => {
  expect(
    getTransactionsToExecute({
      results: [
        { nonce: 5, submissionDate: "2023-01-05T12:00:00" },
        { nonce: 2, submissionDate: "2023-01-02T12:00:00" },
        { nonce: 2, submissionDate: "2023-01-02T14:00:00" },
        { nonce: 3, submissionDate: "2023-01-03T12:00:00" },
        { nonce: 4, submissionDate: "2023-01-04T14:00:00" },
        { nonce: 4, submissionDate: "2023-01-04T12:00:00" },
        { nonce: 1, submissionDate: "2023-01-01T12:00:00" },
      ],
    }),
  ).toEqual([
    { nonce: 1, submissionDate: "2023-01-01T12:00:00" },
    { nonce: 2, submissionDate: "2023-01-02T14:00:00" },
    { nonce: 3, submissionDate: "2023-01-03T12:00:00" },
    { nonce: 4, submissionDate: "2023-01-04T14:00:00" },
    { nonce: 5, submissionDate: "2023-01-05T12:00:00" },
  ]);
});
