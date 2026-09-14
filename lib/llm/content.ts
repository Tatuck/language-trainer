/** User message content parts shared by the analyze and reply routes. */
export type AudioContentPart = { type: "input_audio"; input_audio: { data: string; format: "wav" } };
export type TextContentPart = { type: "text"; text: string };
export type UserContent = string | Array<AudioContentPart | TextContentPart>;
