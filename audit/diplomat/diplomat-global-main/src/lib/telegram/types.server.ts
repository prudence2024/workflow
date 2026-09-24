export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  webhookSecret?: string;
}

export interface CommandContext {
  text: string;
  chatId: number;
  userId: number;
  username?: string;
  firstName?: string;
  updateId: number;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}
