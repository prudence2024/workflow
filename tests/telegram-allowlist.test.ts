import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allowedChatIds, handleTelegramCommand, isAllowedChat } from "../src/lib/telegram";

/**
 * The founder bot must fail closed: an unconfigured or mismatched chat id can
 * never reach a command handler, and unauthorised chats learn nothing.
 */
describe("telegram bot allowlist", () => {
  const original = process.env.TELEGRAM_ALLOWED_CHAT_IDS;

  afterEach(() => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = original;
  });

  it("fails closed when no chat id is configured", () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "";
    expect(allowedChatIds()).toEqual([]);
    expect(isAllowedChat("12345")).toBe(false);
  });

  it("fails closed for undefined or null chat ids", () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "12345";
    expect(isAllowedChat(undefined)).toBe(false);
    expect(isAllowedChat(null)).toBe(false);
  });

  it("parses a comma-separated allowlist and ignores whitespace", () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = " 111 , 222 ,, 333 ";
    expect(allowedChatIds()).toEqual(["111", "222", "333"]);
    expect(isAllowedChat(222)).toBe(true);
    expect(isAllowedChat(999)).toBe(false);
  });
});

describe("telegram command handling for unauthorised chats", () => {
  beforeEach(() => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "424242";
  });

  it("returns no operational detail to an unauthorised chat", async () => {
    const reply = await handleTelegramCommand("999999", "/status");
    expect(reply.ok).toBe(false);
    expect(reply.text).toBe("Not authorised.");
    // The reply must not leak whether the bot is configured or what commands exist.
    expect(reply.text).not.toContain("/outbox");
    expect(reply.text).not.toContain("Workspaces");
  });

  it("rejects an unauthorised /help so the command surface stays private", async () => {
    const reply = await handleTelegramCommand("1", "/help");
    expect(reply.ok).toBe(false);
    expect(reply.text).not.toContain("operations bot");
  });
});
