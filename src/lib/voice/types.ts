export type VoiceState = "idle" | "listening" | "understanding" | "thinking" | "speaking";

export interface SpeechToTextProvider {
  start(onInterim: (text: string) => void, onFinal: (text: string) => void, onError: (message: string) => void): void;
  stop(): void;
}

export interface TextToSpeechProvider {
  speak(text: string, onEnd?: () => void): void;
  cancel(): void;
}

export interface SpeechToSpeechProvider {
  transcribeAndRespond(input: string): Promise<string>;
}