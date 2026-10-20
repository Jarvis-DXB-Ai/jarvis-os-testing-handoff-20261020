export type ConversationHistoryMode='recent'|'fresh';
export function conversationHistoryMode(value?:unknown):ConversationHistoryMode;
export function savedConversationHistoryMode(job:{context?:string}):ConversationHistoryMode;
export function conversationHistoryPacket(jobs:{id:string;brief:string;status:string;output?:string|null}[],mode:ConversationHistoryMode):{historyIds:string[];context:string};
