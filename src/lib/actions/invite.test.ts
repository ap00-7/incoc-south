import { afterEach, describe, expect, it, vi } from "vitest";
import inviteMember from "../../../api/invite";

type ResponseStub = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => ResponseStub;
  json: (value: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function createResponse(): ResponseStub {
  const response: ResponseStub = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(value) {
      response.body = value;
    },
    setHeader(name, value) {
      response.headers[name] = value;
    },
  };
  return response;
}

async function callInvite(request: Record<string, unknown>) {
  const response = createResponse();
  await inviteMember(request as never, response as never);
  return response;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("invitation endpoint request guards", () => {
  it("allows only POST requests", async () => {
    const response = await callInvite({ method: "GET", headers: {} });

    expect(response.statusCode).toBe(405);
    expect(response.headers.Allow).toBe("POST");
  });

  it("rejects unknown invitation fields", async () => {
    const response = await callInvite({
      method: "POST",
      headers: {},
      body: { email: "owner@example.com", display_name: "Owner", role: "viewer", admin: true },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects requests from another origin", async () => {
    vi.stubEnv("SITE_URL", "https://incoc.example");
    const response = await callInvite({
      method: "POST",
      headers: { origin: "https://attacker.example" },
      body: { email: "viewer@example.com", display_name: "Viewer", role: "viewer" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects requests without an origin", async () => {
    vi.stubEnv("SITE_URL", "https://incoc.example");
    const response = await callInvite({
      method: "POST",
      headers: {},
      body: { email: "viewer@example.com", display_name: "Viewer", role: "viewer" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("requires an authenticated owner session", async () => {
    vi.stubEnv("SITE_URL", "https://incoc.example");
    const response = await callInvite({
      method: "POST",
      headers: { origin: "https://incoc.example" },
      body: { email: "viewer@example.com", display_name: "Viewer", role: "viewer" },
    });

    expect(response.statusCode).toBe(401);
  });
});