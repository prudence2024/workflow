import { expect, it } from "vitest";
import { decideSessionCompletion, SESSION_COMPLETION_MAX_ATTEMPTS } from "../src/lib/sessionCompletion";

it("requires a confirmed server identity before navigation", () => {
  expect(decideSessionCompletion({server:{authenticated:true,userReady:false},clientSignedIn:true,attempts:1})).toBe("retry");
  expect(decideSessionCompletion({server:{authenticated:true,userReady:true},clientSignedIn:true,attempts:1})).toBe("ready");
});
it("ends unsuccessful convergence in recovery rather than unbounded retries", () => {
  expect(decideSessionCompletion({server:{authenticated:false,userReady:false},clientSignedIn:true,attempts:SESSION_COMPLETION_MAX_ATTEMPTS})).toBe("recovery");
});
it("returns signed out when Clerk confirms no browser session", () => {
  expect(decideSessionCompletion({server:{authenticated:false,userReady:false},clientSignedIn:false,attempts:1})).toBe("signed_out");
});
