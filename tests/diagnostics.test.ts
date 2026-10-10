import { describe, expect, it } from "vitest";
import { safeErrorDiagnostic } from "../src/lib/diagnostics";

describe("operational diagnostic privacy", () => {
  it("retains safe PostgreSQL codes without provider or personal payloads", () => {
    const error = {name:"DatabaseError",code:"23505",message:"postgres://fixture:private@host/db email=person@example.invalid phone=+2348012345678",cause:{message:"private payload"}};
    expect(safeErrorDiagnostic(error)).toEqual({errorName:"DatabaseError",code:"23505",safeMessage:"Operational failure (23505)"});
  });
  it("rejects arbitrary text placed in code and class fields", () => {
    expect(safeErrorDiagnostic({name:"private@example.invalid",code:"Bearer private-token"})).toEqual({errorName:"Error",code:null,safeMessage:"Operational failure"});
  });
  it("handles null and nested safe codes", () => {
    expect(safeErrorDiagnostic(null).code).toBeNull();
    expect(safeErrorDiagnostic({cause:{code:"ECONNRESET"}}).code).toBe("ECONNRESET");
  });
});
