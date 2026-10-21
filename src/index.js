require("dotenv").config();

// (DNS logic simplified for AgentZZ-VM environment)

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

try {
  if (!process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = require("ffmpeg-static");
  }
} catch {
  // Falls ffmpeg-static nicht geladen werden kann, gibt es später eine klare Fehlermeldung beim Abspielen.
}

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  StreamType,
} = require("@discordjs/voice");
const prism = require("prism-media");
const wav = require("wav");
const OpenAI = require("openai");
const googleTTS = require("google-tts-api");
const { request } = require("undici");
const http = require("node:http");

const REQUIRED_ENV = ["DISCORD_TOKEN"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Fehlende Umgebungsvariable: ${key}`);
    process.exit(1);
  }
}

const PREFIX = process.env.BOT_PREFIX || "!";
const BOT_LANGUAGE = "fr";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";
const GROQ_TRANSCRIBE_MODEL =
  process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const GEMINI_API_KEYS = [...new Set([process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")].map((key) => String(key || "").trim()).filter(Boolean))];
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || GEMINI_MODEL;
const VERTEX_API_KEY = process.env.VERTEX_API_KEY || "";
const VERTEX_BASE_URL = process.env.VERTEX_BASE_URL || "https://aiplatform.googleapis.com";
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || "";
const VERTEX_LOCATION = (process.env.VERTEX_LOCATION || "global").trim();
const VERTEX_MODEL = process.env.VERTEX_MODEL || "gemini-3.8-flash";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // "George" (starke, klare Stimme)
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_VOICE_PRESET = (process.env.ELEVENLABS_VOICE_PRESET || "balanced").toLowerCase();
const ELEVENLABS_STABILITY = parseEnvFloat(process.env.ELEVENLABS_STABILITY, null);
const ELEVENLABS_SIMILARITY_BOOST = parseEnvFloat(process.env.ELEVENLABS_SIMILARITY_BOOST, null);
const ELEVENLABS_STYLE = parseEnvFloat(process.env.ELEVENLABS_STYLE, null);
const ELEVENLABS_USE_SPEAKER_BOOST =
  process.env.ELEVENLABS_USE_SPEAKER_BOOST == null || process.env.ELEVENLABS_USE_SPEAKER_BOOST === ""
    ? null
    : parseEnvBool(process.env.ELEVENLABS_USE_SPEAKER_BOOST, true);
const TTS_PROVIDER = (
  process.env.TTS_PROVIDER || (ELEVENLABS_API_KEY ? "elevenlabs" : "google")
).toLowerCase();
const AUTO_JOIN_VOICE_CHANNELS_DEFAULT = parseEnvBool(process.env.AUTO_JOIN_VOICE_CHANNELS, true);
const autoJoinOverrides = new Map();
const dialogueLogSettings = new Map();
const AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS = Number.parseInt(
  process.env.AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS || "60000",
  10,
);
const AUTO_JOIN_RETRY_COOLDOWN_MS = Number.parseInt(
  process.env.AUTO_JOIN_RETRY_COOLDOWN_MS || "15000",
  10,
);
const GLOBAL_REPLY_COOLDOWN_MS = parseEnvInt(process.env.GLOBAL_REPLY_COOLDOWN_MS, 4500);
const USER_REPLY_COOLDOWN_MS = parseEnvInt(process.env.USER_REPLY_COOLDOWN_MS, 7000);
const BOT_ECHO_GUARD_MS = parseEnvInt(process.env.BOT_ECHO_GUARD_MS, 2200);
const DUPLICATE_TRANSCRIPT_WINDOW_MS = parseEnvInt(
  process.env.DUPLICATE_TRANSCRIPT_WINDOW_MS,
  20000,
);
const MIN_TRANSCRIPT_CHARS = parseEnvInt(process.env.MIN_TRANSCRIPT_CHARS, 3);
const REPLY_ONLY_WHEN_ADDRESSED = parseEnvBool(process.env.REPLY_ONLY_WHEN_ADDRESSED, true);
const MIN_UNADDRESSED_WORDS = parseEnvInt(process.env.MIN_UNADDRESSED_WORDS, 5);
const BOT_FOLLOW_UP_WINDOW_MS = parseEnvInt(process.env.BOT_FOLLOW_UP_WINDOW_MS, 90000);
const GEMINI_REQUEST_TIMEOUT_MS = parseEnvInt(process.env.GEMINI_REQUEST_TIMEOUT_MS, 12000);
const MIN_TRANSCRIPT_WORDS = parseEnvInt(process.env.MIN_TRANSCRIPT_WORDS, 2);
const CHAT_MAX_TOKENS = parseEnvInt(process.env.CHAT_MAX_TOKENS, 220);
const MAX_TTS_CHARS = parseEnvInt(process.env.MAX_TTS_CHARS, 1200);
const MEMORY_MAX_MESSAGES = parseEnvInt(process.env.MEMORY_MAX_MESSAGES, 24);
const MEMORY_MAX_CHARS = parseEnvInt(process.env.MEMORY_MAX_CHARS, 7000);
const BOT_WAKE_WORDS = parseCsvEnv(process.env.BOT_WAKE_WORDS, ["bot", "discord bot", "chatia", "chat ia", "chatgpt", "chat gpt", "tchatgpt", "tchat gpt", "tchatteia", "tchatte ia", "tchatia", "tchat ia", "tchat ia", "chat y a", "chati a"]);
const IGNORE_COURTESY_ONLY = parseEnvBool(process.env.IGNORE_COURTESY_ONLY, true);
const TTS_ERROR_NOTIFY_COOLDOWN_MS = parseEnvInt(process.env.TTS_ERROR_NOTIFY_COOLDOWN_MS, 60000);
const MIN_PCM_BYTES = parseEnvInt(process.env.MIN_PCM_BYTES, 120_000);
const RECORDINGS_DIR = path.join(process.cwd(), "tmp-recordings");
const STT_LANGUAGE = normalizeSttLanguage(BOT_LANGUAGE);
const GOOGLE_TTS_LANGUAGE = normalizeGoogleTtsLanguage(BOT_LANGUAGE);

if (LLM_PROVIDER !== "gemini" && !process.env.GROQ_API_KEY) {
  console.error("Fehlende Umgebungsvariable: GROQ_API_KEY (erforderlich fuer den Groq-Provider).");
  process.exit(1);
}

if (LLM_PROVIDER === "gemini" && GEMINI_API_KEYS.length === 0) {
  console.error("LLM_PROVIDER=gemini gesetzt, aber GEMINI_API_KEY oder GEMINI_API_KEYS fehlt.");
  process.exit(1);
}

if (LLM_PROVIDER === "vertex" && !VERTEX_API_KEY) {
  console.error("LLM_PROVIDER=vertex gesetzt, aber VERTEX_API_KEY fehlt.");
  process.exit(1);
}

if (!["groq", "vertex", "gemini"].includes(LLM_PROVIDER)) {
  console.error("Ungueltiger LLM_PROVIDER: " + LLM_PROVIDER + ". Erlaubt: groq, vertex, gemini");
  process.exit(1);
}

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "not-used-with-gemini",
  baseURL: GROQ_BASE_URL,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/** @type {Map<string, any>} */
const sessions = new Map();
/** @type {Map<string, number>} */
const autoJoinCooldowns = new Map();
/** @type {Map<string, Promise<void>>} */
const autoJoinReconcileQueues = new Map();
/** @type {Map<string, any>} */
const channelMemories = new Map();

function isAutoJoinEnabled(guildId) {
  return autoJoinOverrides.has(guildId) ? autoJoinOverrides.get(guildId) : AUTO_JOIN_VOICE_CHANNELS_DEFAULT;
}

function getDialogueLogSettings(guildId) {
  if (!dialogueLogSettings.has(guildId)) dialogueLogSettings.set(guildId, { enabled: true, channelId: null });
  return dialogueLogSettings.get(guildId);
}

async function sendDialogueLog(session, content) {
  const settings = getDialogueLogSettings(session.guildId);
  if (!settings.enabled) return;
  const channel = client.channels.cache.get(settings.channelId || session.textChannelId);
  if (!channel || !channel.isTextBased()) return;
  try { await channel.send(content); }
  catch (error) { log("[" + session.guildId + "] Impossible d’envoyer le dialogue dans le salon de logs", error?.message || error); }
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function parseEnvBool(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseEnvInt(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseEnvFloat(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseCsvEnv(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const parts = String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function normalizeSttLanguage(language) {
  const base = String(language || "de").trim();
  if (!base) return "de";
  return base.slice(0, 2).toLowerCase();
}

function normalizeGoogleTtsLanguage(language) {
  const value = String(language || "de").trim();
  if (!value) return "de";
  const primary = value.slice(0, 2).toLowerCase();
  if (primary === "de") return "de";
  return primary;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function resolveElevenLabsVoiceSettings() {
  const presets = {
    balanced: {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.35,
      use_speaker_boost: true,
    },
    aggressive: {
      // Mehr Punch/Charakter, etwas weniger Stabilitaet, hoher Style.
      stability: 0.18,
      similarity_boost: 0.88,
      style: 0.92,
      use_speaker_boost: true,
    },
    intense: {
      stability: 0.12,
      similarity_boost: 0.9,
      style: 1.0,
      use_speaker_boost: true,
    },
  };

  const base = presets[ELEVENLABS_VOICE_PRESET] || presets.balanced;

  return {
    stability: clamp01(ELEVENLABS_STABILITY ?? base.stability),
    similarity_boost: clamp01(ELEVENLABS_SIMILARITY_BOOST ?? base.similarity_boost),
    style: clamp01(ELEVENLABS_STYLE ?? base.style),
    use_speaker_boost:
      typeof ELEVENLABS_USE_SPEAKER_BOOST === "boolean"
        ? ELEVENLABS_USE_SPEAKER_BOOST
        : base.use_speaker_boost,
  };
}

async function ensureRecordingsDir() {
  await fsp.mkdir(RECORDINGS_DIR, { recursive: true });
}

function getMemberVoiceChannel(message) {
  return message.member?.voice?.channel ?? null;
}

function buildSystemPrompt() {
  return [
    "Tu es un assistant vocal Discord qui parle naturellement en français.",
    "Réponds toujours en français, sauf si la personne demande explicitement une traduction.",
    "Réponds uniquement à la personne qui t’interpelle ou te pose directement une question.",
    "Pour une question simple, réponds brièvement. Pour une question complexe, utilise 2 à 5 phrases.",
    "Si l’audio est incompréhensible, demande brièvement de répéter et n’invente aucun détail.",
    "Évite les phrases de remplissage, les présentations répétitives et les émojis.",
    "Ne répète pas les insultes ni les propos discriminatoires.",
    "Tu es un bot vocal Discord. Ne prétends pas effectuer des actions externes.",
    "Si une action n’est pas possible, explique-le brièvement et mentionne uniquement les commandes réelles (!join, !leave, !help).",
  ].join(" ");
}

function normalizeTranscriptText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[„]/g, '"')
    .trim();
}

function canonicalizeTranscript(text) {
  return normalizeTranscriptText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  const matches = normalizeTranscriptText(text).match(/\p{L}[\p{L}\p{N}-]*/gu);
  return matches ? matches.length : 0;
}

function looksLikeNoiseTranscript(text) {
  const clean = normalizeTranscriptText(text);
  if (!clean) return true;
  if (clean.length < MIN_TRANSCRIPT_CHARS) return true;

  const words = countWords(clean);
  const lower = clean.toLowerCase();

  if (
    words <= 1 &&
    /^(hm+|mhm+|hmm+|uh+|uhm+|mm+|äh+|ähm+|eh+|ja+|ne+|nee+|ok+|okay+|jo+|lol+|haha+|hahaha+)$/.test(
      lower,
    )
  ) {
    return true;
  }

  if (words === 0) return true;
  if (words < MIN_TRANSCRIPT_WORDS && !looksDirectedAtBot(clean)) return true;

  return false;
}

function isCourtesyOnlyTranscript(text) {
  const lower = canonicalizeTranscript(text);
  if (!lower) return false;

  return [
    /^(vielen dank|danke|danke dir|danke schoen|dankeschon|thx|thanks|merci)$/,
    /^(bitte|gern(e)?|gerne danke|kein problem|alles klar|ok(ay)?|jo|ja)$/,
    /^(mhm|hmm|aha|nice|stark|top)$/,
  ].some((pattern) => pattern.test(lower));
}

function looksLikelyGibberish(text) {
  const clean = normalizeTranscriptText(text);
  if (!clean) return true;

  const words = clean.match(/\p{L}[\p{L}\p{N}-]*/gu) || [];
  if (words.length === 0) return true;

  // Viele STT-Fehltranskripte enthalten extrem kurze/zerhackte Token-Ketten.
  const veryShortWordRatio = words.filter((w) => w.length <= 2).length / words.length;
  if (words.length >= 6 && veryShortWordRatio > 0.6 && !looksDirectedAtBot(clean)) {
    return true;
  }

  const uniqueRatio = new Set(words.map((w) => w.toLowerCase())).size / words.length;
  if (words.length >= 5 && uniqueRatio < 0.35) {
    return true;
  }

  return false;
}

function isLikelyParrotedBotText(memory, transcript) {
  const lastAssistant = [...memory.history].reverse().find((msg) => msg?.role === "assistant");
  if (!lastAssistant?.content) return false;

  const a = canonicalizeTranscript(lastAssistant.content);
  const b = canonicalizeTranscript(transcript);
  if (!a || !b) return false;

  if (a === b) return true;

  // Troll-Fall: Nutzer liest den letzten Bot-Text halb vor.
  if (a.length >= 40 && b.length >= 30 && (a.includes(b) || b.includes(a.slice(0, Math.min(a.length, 120))))) {
    return true;
  }

  return false;
}

function buildHardCapabilityReply(transcript) {
  const lower = normalizeTranscriptText(transcript).toLowerCase();

  if (
    /(discord-?skill|skill .*deaktiv|modul .*abschalt|abschalt.*modul|support-bericht|support report|systemadministr)/.test(
      lower,
    )
  ) {
    return "Je ne peux pas désactiver de fonction ni modifier des systèmes. Utilise les commandes disponibles : !join, !leave ou !help.";
  }

  if (/(aus dem .*channel.*raus|aus dem channel .*raus|verpiss|verlasse .*channel)/.test(lower)) {
    return "Je peux quitter le salon vocal uniquement avec la commande !leave.";
  }

  if (/(wieder reinkommen|raus .* wieder rein|rejoin|neu joinen)/.test(lower)) {
    return "Pour rejoindre à nouveau le salon, utilise !leave puis !join.";
  }

  if (/(kannst du .*stimme|warum .*stimme .*komisch|deine stimme)/.test(lower)) {
    return "Si ma voix est étrange ou absente, la synthèse vocale rencontre un problème. Je peux alors répondre uniquement dans le chat.";
  }

  return null;
}

function hasExplicitBotWakeWord(text) {
  const lower = normalizeTranscriptText(text).toLowerCase();
  if (!lower) return false;

  const normalizedText = " " + lower.replace(/[^a-z0-9à-ÿ]+/gi, " ") + " ";
  return BOT_WAKE_WORDS.some((wakeWord) => {
    const normalizedWakeWord = wakeWord.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim();
    return normalizedWakeWord && normalizedText.includes(" " + normalizedWakeWord + " ");
  });
}

function looksDirectedAtBot(text) {
  const lower = normalizeTranscriptText(text).toLowerCase();
  if (!lower) return false;
  if (hasExplicitBotWakeWord(text)) return true;

  return /^(qui|quoi|que|qu’est-ce que|quest-ce que|comment|où|ou|quand|pourquoi|est-ce que|est ce que|c’est quoi|c'est quoi|c est quoi|ça veut dire quoi|ca veut dire quoi|tu peux|peux-tu|peux tu|tu peux me dire|tu peux expliquer|tu connais|tu sais|explique|explique-moi|explique moi|dis-moi|dis moi|tu pourrais|pourrais-tu|pourrais tu|wer|was|wie|wo|wann|warum|wieso|weshalb|kannst du|bitte|erklär|erklaer|sag mal)(\s|$)/i.test(lower);
}
async function classifyWhetherAddressedToBot(memory, transcript, hasAddressingClue) {
  const recentContext = memory.history
    .slice(-6)
    .map((message) => ({
      role: message.role === "assistant" ? "ChatIA" : "interlocuteur",
      content: trimForMemory(message.content || ""),
    }))
    .map((message) => message.role + ": " + message.content)
    .join("\n");

  const prompt = [
    "Tu es un détecteur d'intention pour un assistant vocal dans un salon Discord.",
    "Décide si la dernière transcription s'adresse réellement à ChatIA, ou si les personnes parlent entre elles.",
    "Réponds uniquement par OUI ou NON.",
    "OUI si la personne pose une question ou donne une instruction à ChatIA, ou continue clairement une conversation récente avec ChatIA même sans répéter son nom.",
    "NON si la personne parle de ChatGPT, Gemini, Claude ou d'une autre IA à ses amis, ou pose une question à quelqu'un d'autre.",
    "La simple mention d'un nom d'IA ne suffit jamais à répondre OUI.",
    "Si le contexte ne permet pas de savoir, réponds NON.",
    "Un indice lexical a été détecté : " + (hasAddressingClue ? "oui" : "non") + ". Cet indice n'est pas une preuve à lui seul.",
    "Contexte récent :\n" + (recentContext || "(aucun échange récent)"),
    "Nouvelle transcription : " + transcript,
    "La décision doit concerner uniquement cette transcription."
  ].join("\n");

  try {
    const data = await callGeminiGenerateContent(GEMINI_MODEL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4 },
    });
    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === "string" ? part.text : "")
      .join(" ")
      .trim()
      .toUpperCase();
    const decision = answer?.match(/\b(OUI|NON)\b/)?.[1];
    if (decision) return decision === "OUI";
    log("Gemini intent check returned an unclear result; ignoring transcript to avoid an unsolicited reply.");
  } catch (error) {
    log("Gemini intent check failed; ignoring transcript to avoid an unsolicited reply.", error?.message || error);
  }

  return false;
}

function getChannelMemoryKey(guildId, voiceChannelId) {
  return `${guildId}:${voiceChannelId}`;
}

function getOrCreateChannelMemory(guildId, voiceChannelId) {
  const key = getChannelMemoryKey(guildId, voiceChannelId);
  let memory = channelMemories.get(key);

  if (!memory) {
    memory = {
      key,
      history: [],
      lastReplyAt: 0,
      lastBotSpeechStartedAt: 0,
      lastBotSpeechEndedAt: 0,
      lastTtsErrorNotifyAt: 0,
      lastReplyByUser: new Map(),
      recentTranscriptByUser: new Map(),
      lastTouchedAt: Date.now(),
    };
    channelMemories.set(key, memory);
  }

  memory.lastTouchedAt = Date.now();
  return memory;
}

function pruneConversationHistory(memory) {
  while (memory.history.length > MEMORY_MAX_MESSAGES) {
    memory.history.shift();
  }

  let totalChars = memory.history.reduce(
    (sum, message) => sum + String(message?.content || "").length,
    0,
  );

  while (totalChars > MEMORY_MAX_CHARS && memory.history.length > 2) {
    const removed = memory.history.shift();
    totalChars -= String(removed?.content || "").length;
  }
}

function appendConversationHistory(memory, ...messages) {
  memory.history.push(...messages);
  memory.lastTouchedAt = Date.now();
  pruneConversationHistory(memory);
}

function trimForMemory(text) {
  const singleLine = normalizeTranscriptText(text);
  if (singleLine.length <= 700) return singleLine;
  return `${singleLine.slice(0, 697).trim()}...`;
}

async function shouldIgnoreTranscript(session, userId, transcript) {
  const memory = session.memory;
  const now = Date.now();
  const clean = normalizeTranscriptText(transcript);

  memory.lastTouchedAt = now;

  if (session.botSpeaking) {
    return { ignore: true, reason: "bot-speaking" };
  }

  if (now - memory.lastBotSpeechEndedAt < BOT_ECHO_GUARD_MS) {
    return { ignore: true, reason: "echo-guard" };
  }

  if (looksLikeNoiseTranscript(clean)) {
    return { ignore: true, reason: "noise-short" };
  }

  if (IGNORE_COURTESY_ONLY && isCourtesyOnlyTranscript(clean)) {
    return { ignore: true, reason: "courtesy-only" };
  }

  if (isLikelyParrotedBotText(memory, clean)) {
    return { ignore: true, reason: "parroted-bot-text" };
  }

  const canonical = canonicalizeTranscript(clean);
  const hasExplicitWakeWord = hasExplicitBotWakeWord(clean);
  const hasAddressingClue = looksDirectedAtBot(clean);
  const voiceChannel = client.channels.cache.get(session.voiceChannelId);
  const humanCount = getHumanVoiceMemberCount(voiceChannel);
  const aloneWithBot = humanCount === 1;
  const recentBotConversation = now - memory.lastReplyAt < BOT_FOLLOW_UP_WINDOW_MS;
  let directedAtBot = hasExplicitWakeWord;

  if (!hasExplicitWakeWord && aloneWithBot) {
    directedAtBot = true;
    log(`[${session.guildId}] Accepting voice transcript because only one human is in the voice channel.`);
  } else if (!hasExplicitWakeWord && recentBotConversation) {
    directedAtBot = true;
    log(`[${session.guildId}] Accepting transcript as a follow-up to the bot's recent reply.`);
  } else if (!hasExplicitWakeWord && hasAddressingClue) {
    directedAtBot = await classifyWhetherAddressedToBot(memory, clean, hasAddressingClue);
  }

  if (REPLY_ONLY_WHEN_ADDRESSED && !directedAtBot) return { ignore: true, reason: "not-addressed-to-bot" };
  if (!directedAtBot && countWords(clean) < MIN_UNADDRESSED_WORDS) return { ignore: true, reason: "short-conversation" };
  const lastSame = memory.recentTranscriptByUser.get(userId);

  if (
    lastSame &&
    lastSame.canonical === canonical &&
    now - lastSame.at < DUPLICATE_TRANSCRIPT_WINDOW_MS
  ) {
    return { ignore: true, reason: "duplicate" };
  }

  if (!directedAtBot && now - memory.lastReplyAt < GLOBAL_REPLY_COOLDOWN_MS) {
    return { ignore: true, reason: "global-cooldown" };
  }

  const lastUserReplyAt = memory.lastReplyByUser.get(userId) || 0;
  if (!directedAtBot && now - lastUserReplyAt < USER_REPLY_COOLDOWN_MS) {
    return { ignore: true, reason: "user-cooldown" };
  }

  memory.recentTranscriptByUser.set(userId, { canonical, at: now });
  for (const [key, value] of memory.recentTranscriptByUser.entries()) {
    if (now - value.at > DUPLICATE_TRANSCRIPT_WINDOW_MS) {
      memory.recentTranscriptByUser.delete(key);
    }
  }

  const likelyGibberish = looksLikelyGibberish(clean);
  return { ignore: false, transcript: clean, directedAtBot, likelyGibberish };
}

function setAutoJoinCooldown(guildId, ms) {
  autoJoinCooldowns.set(guildId, Date.now() + Math.max(0, ms));
}

function hasAutoJoinCooldown(guildId) {
  return Date.now() < (autoJoinCooldowns.get(guildId) || 0);
}

function getHumanVoiceMemberCount(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return 0;

  let count = 0;
  for (const state of channel.guild.voiceStates.cache.values()) {
    if (state.channelId !== channel.id) continue;
    const member = state.member;
    if (!member || member.user?.bot) continue;
    count += 1;
  }
  return count;
}

function canBotJoinAndSpeak(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  const me = channel.guild.members.me;
  if (!me) return true;

  const perms = channel.permissionsFor(me);
  if (!perms) return false;

  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.Connect) &&
    perms.has(PermissionFlagsBits.Speak)
  );
}

function findBestActiveVoiceChannel(guild) {
  const candidates = [];

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    if (!canBotJoinAndSpeak(channel)) continue;

    const humans = getHumanVoiceMemberCount(channel);
    if (humans <= 0) continue;

    candidates.push({ channel, humans });
  }

  candidates.sort((a, b) => {
    if (b.humans !== a.humans) return b.humans - a.humans;
    return a.channel.position - b.channel.position;
  });

  return candidates[0]?.channel || null;
}

function pickDefaultTextChannelId(guild) {
  const me = guild.members.me;
  const ordered = [];

  if (guild.systemChannel?.type === ChannelType.GuildText) {
    ordered.push(guild.systemChannel);
  }

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    if (ordered.some((existing) => existing.id === channel.id)) continue;
    ordered.push(channel);
  }

  for (const channel of ordered) {
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms) {
      if (!perms.has(PermissionFlagsBits.ViewChannel)) continue;
      if (!perms.has(PermissionFlagsBits.SendMessages)) continue;
    }
    return channel.id;
  }

  return null;
}

function enqueueAutoJoinReconcile(guild, reason) {
  const guildId = guild.id;
  const previous = autoJoinReconcileQueues.get(guildId) || Promise.resolve();

  const next = previous
    .then(async () => {
      await reconcileAutoJoinForGuild(guild, reason);
    })
    .catch((error) => {
      log(`[${guildId}] auto reconcile error`, error);
    })
    .finally(() => {
      if (autoJoinReconcileQueues.get(guildId) === next) {
        autoJoinReconcileQueues.delete(guildId);
      }
    });

  autoJoinReconcileQueues.set(guildId, next);
}

async function reconcileAutoJoinForGuild(guild, reason) {
  if (!isAutoJoinEnabled(guild.id)) return;

  const currentSession = sessions.get(guild.id);
  if (currentSession) {
    const currentChannel = guild.channels.cache.get(currentSession.voiceChannelId);
    const humansInCurrent = getHumanVoiceMemberCount(currentChannel);

    if (humansInCurrent > 0) {
      return;
    }

    log(`[${guild.id}] Auto-leave ${currentSession.voiceChannelId} (keine Nutzer mehr)`);
    await destroySession(guild.id);
  }

  if (hasAutoJoinCooldown(guild.id)) {
    return;
  }

  const target = findBestActiveVoiceChannel(guild);
  if (!target) return;

  await joinVoiceAuto(guild, target, reason);
}

function createSession(guildId, connection, textChannelId, voiceChannelId) {
  const memory = getOrCreateChannelMemory(guildId, voiceChannelId);
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const session = {
    guildId,
    textChannelId,
    voiceChannelId,
    connection,
    player,
    activeCaptures: new Set(),
    processingQueue: Promise.resolve(),
    processingBusy: false,
    botSpeaking: false,
    memory,
    destroyed: false,
    recoveryPromise: null,
  };

  player.on(AudioPlayerStatus.Playing, () => {
    session.botSpeaking = true;
    session.memory.lastBotSpeechStartedAt = Date.now();
    session.memory.lastTouchedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Idle, () => {
    session.botSpeaking = false;
    session.memory.lastBotSpeechEndedAt = Date.now();
    session.memory.lastTouchedAt = Date.now();
  });

  player.on("error", (error) => {
    log(`[${guildId}] Audio player error`, error);
  });

  connection.subscribe(player);

  connection.on("error", (error) => {
    log(`[${guildId}] Voice connection error`, error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    if (session.destroyed || session.recoveryPromise) return;

    session.recoveryPromise = (async () => {
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
        log(`[${guildId}] Voice connection recovered after a temporary disconnect.`);
      } catch (error) {
        if (session.destroyed) return;

        log(`[${guildId}] Voice connection did not recover; resetting session.`, error?.message || error);
        await destroySession(guildId);

        if (isAutoJoinEnabled(guildId)) {
          setAutoJoinCooldown(guildId, AUTO_JOIN_RETRY_COOLDOWN_MS);
          const retryTimer = setTimeout(() => {
            const guild = client.guilds.cache.get(guildId);
            if (!guild || !isAutoJoinEnabled(guildId)) return;
            autoJoinCooldowns.delete(guildId);
            enqueueAutoJoinReconcile(guild, "voice-recovery");
          }, AUTO_JOIN_RETRY_COOLDOWN_MS);
          retryTimer.unref?.();
        }
      } finally {
        session.recoveryPromise = null;
      }
    })();
  });

  connection.receiver.speaking.on("start", (userId) => {
    log(`[${guildId}] Détection audio: début de parole utilisateur ${userId}`);
    if (session.destroyed) return;
    if (session.activeCaptures.has(userId)) return;
    if (session.processingBusy) return;
    if (session.botSpeaking) return;
    if (Date.now() - session.memory.lastBotSpeechEndedAt < BOT_ECHO_GUARD_MS) return;

    const member = client.guilds.cache.get(guildId)?.voiceStates?.cache.get(userId)?.member;
    if (member?.user?.bot) return;

    void captureUtterance(session, userId);
  });

  return session;
}

async function joinVoiceAuto(guild, voiceChannel, reason) {
  if (sessions.has(guild.id)) return;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    log(`[${guild.id}] Voice state: ${oldState.status} -> ${newState.status}`);
  });
  connection.on('error', (error) => {
    log(`[${guild.id}] Voice error`, error);
  });


  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 45_000);

    const textChannelId = pickDefaultTextChannelId(guild);
    const session = createSession(guild.id, connection, textChannelId, voiceChannel.id);
    sessions.set(guild.id, session);

    log(
      `[${guild.id}] Auto-joined voice channel "${voiceChannel.name}" (${reason}, users=${getHumanVoiceMemberCount(
        voiceChannel,
      )})`,
    );
  } catch (error) {
    try {
      connection.destroy();
    } catch {
      // ignore
    }

    setAutoJoinCooldown(guild.id, AUTO_JOIN_RETRY_COOLDOWN_MS);
    log(`[${guild.id}] Auto-join failed for "${voiceChannel.name}"`, error);
  }
}

function enqueueSessionWork(session, work) {
  session.processingQueue = session.processingQueue
    .then(async () => {
      if (session.destroyed) return;
      await work();
    })
    .catch((error) => {
      log(`[${session.guildId}] Queue error`, error);
    });
  return session.processingQueue;
}

async function captureUtterance(session, userId) {
  log(`[${session.guildId}] Capture audio démarrée pour utilisateur ${userId}`);
  session.activeCaptures.add(userId);

  const filePath = path.join(
    RECORDINGS_DIR,
    `${session.guildId}-${userId}-${Date.now()}-${crypto.randomUUID()}.wav`,
  );

  let pcmBytes = 0;
  const opusStream = session.connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 800,
    },
  });

  const decoder = new prism.opus.Decoder({
    frameSize: 960,
    channels: 2,
    rate: 48_000,
  });

  const wavWriter = new wav.Writer({
    channels: 2,
    sampleRate: 48_000,
    bitDepth: 16,
  });

  const fileStream = fs.createWriteStream(filePath);

  let streamErrorHandler;
  const finished = new Promise((resolve, reject) => {
    streamErrorHandler = reject;
    opusStream.on("error", streamErrorHandler);
    decoder.on("error", streamErrorHandler);
    wavWriter.on("error", streamErrorHandler);
    fileStream.on("error", streamErrorHandler);
    fileStream.on("finish", resolve);
  });

  decoder.on("data", (chunk) => {
    pcmBytes += chunk.length;
  });

  opusStream.pipe(decoder).pipe(wavWriter).pipe(fileStream);

  try {
    await finished;

    if (pcmBytes < MIN_PCM_BYTES) {
      log(`[${session.guildId}] Audio trop court (${pcmBytes} octets; minimum ${MIN_PCM_BYTES}), transcription ignorée.`);
      await safeUnlink(filePath);
      return;
    }

    if (session.processingBusy) {
      log(`[${session.guildId}] Capture ignorée pour éviter une file d’attente de réponses vocales.`);
      await safeUnlink(filePath);
      return;
    }

    log(`[${session.guildId}] Audio capturé (${pcmBytes} octets); lancement de la transcription.`);
    session.processingBusy = true;
    try {
      await enqueueSessionWork(session, async () => {
        const transcript = await transcribeAudio(filePath);
        if (!transcript) return;

        const decision = await shouldIgnoreTranscript(session, userId, transcript);
        if (decision.ignore) {
          log(`[${session.guildId}] Transcription ignorée (${decision.reason}) : ${transcript}`);
          return;
        }

        const reply = await generateReply(session, userId, decision.transcript, decision);
        if (!reply) return;

        await speakReply(session, reply);
      });
    } finally {
      session.processingBusy = false;
    }
  } catch (error) {
    if (!String(error?.message || error).includes("compressed data passed is corrupted")) log(`[${session.guildId}] Échec de capture audio`, error);
    await safeUnlink(filePath);
  } finally {
    opusStream.removeListener("error", streamErrorHandler);
    decoder.removeListener("error", streamErrorHandler);
    wavWriter.removeListener("error", streamErrorHandler);
    fileStream.removeListener("error", streamErrorHandler);
    session.activeCaptures.delete(userId);
  }
}

async function safeUnlink(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore
  }
}

async function transcribeAudio(filePath) {
  try {
    let text;
    if (LLM_PROVIDER === "gemini") {
      const audio = await fsp.readFile(filePath);
      const languageName = STT_LANGUAGE === "fr" ? "French" : STT_LANGUAGE === "de" ? "German" : STT_LANGUAGE === "es" ? "Spanish" : STT_LANGUAGE === "en" ? "English" : STT_LANGUAGE;
      const data = await callGeminiGenerateContent(GEMINI_TRANSCRIBE_MODEL, {
        contents: [{ parts: [
          { text: "Transcribe this Discord voice recording in " + languageName + ". Return only the words actually spoken in the original language. Do not translate, explain, or add commentary." },
          { inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } },
        ] }],
        generationConfig: { temperature: 0 },
      });
      text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map((part) => typeof part.text === "string" ? part.text : "").join(" ").trim()
        : "";
    } else {
      const payload = { file: fs.createReadStream(filePath), model: GROQ_TRANSCRIBE_MODEL, language: STT_LANGUAGE, temperature: 0 };
      if (STT_LANGUAGE === "de") payload.prompt = "Discord Voice Chat auf Deutsch. Transkribiere natuerlich auf Deutsch, keine Uebersetzung.";
      const result = await groq.audio.transcriptions.create(payload);
      text = result && result.text;
    }
    text = normalizeTranscriptText(text);
    await safeUnlink(filePath);
    if (!text) return null;
    log("Transcription : " + text);
    return text;
  } catch (error) {
    log("Transcription error", error);
    await safeUnlink(filePath);
    return null;
  }
}

async function generateChatCompletionText(messages) {
  if (LLM_PROVIDER === "vertex") return generateChatCompletionTextWithVertex(messages);
  if (LLM_PROVIDER === "gemini") return generateChatCompletionTextWithGemini(messages);
  return generateChatCompletionTextWithGroq(messages);
}

async function generateChatCompletionTextWithGroq(messages) {
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    temperature: 0.55,
    max_tokens: CHAT_MAX_TOKENS,
  });

  return normalizeTranscriptText(completion.choices?.[0]?.message?.content);
}

function mapOpenAiMessagesToVertex(messages) {
  const contents = [];
  let systemInstruction = null;

  for (const message of messages) {
    const contentText = normalizeTranscriptText(message?.content);
    if (!contentText) continue;

    if (message.role === "system") {
      systemInstruction = {
        parts: [{ text: contentText }],
      };
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: contentText }],
    });
  }

  return { systemInstruction, contents };
}

function buildVertexGenerateContentUrl() {
  const base = VERTEX_BASE_URL.replace(/\/+$/, "");
  const model = encodeURIComponent(VERTEX_MODEL);

  // Standard Vertex endpoint (mit Projekt/Location) falls konfiguriert, sonst API-Key Express-Endpoint.
  const pathPart = VERTEX_PROJECT_ID
    ? `/v1/projects/${encodeURIComponent(VERTEX_PROJECT_ID)}/locations/${encodeURIComponent(VERTEX_LOCATION)}/publishers/google/models/${model}:generateContent`
    : `/v1/publishers/google/models/${model}:generateContent`;

  const url = new URL(`${base}${pathPart}`);
  url.searchParams.set("key", VERTEX_API_KEY);
  return url.toString();
}

const GEMINI_MODEL_COOLDOWN_MS = parseEnvInt(process.env.GEMINI_MODEL_COOLDOWN_MS, 60000);
const geminiModelCooldowns = new Map();

async function callGeminiGenerateContent(modelName, body) {
  const base = GEMINI_BASE_URL.replace(/\\/+$/, "");
  const fallbackModels = parseCsvEnv(
    process.env.GEMINI_FALLBACK_MODELS,
    ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
  );
  const models = [...new Set([modelName, ...fallbackModels].map((name) => String(name || "").trim()).filter(Boolean))];
  let lastError = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const currentModel = models[modelIndex];
    const cooldownUntil = geminiModelCooldowns.get(currentModel) || 0;
    if (cooldownUntil > Date.now()) {
      log("Gemini model " + currentModel + " is rate-limited; skipping it for " + Math.ceil((cooldownUntil - Date.now()) / 1000) + "s and trying the next model.");
      lastError = new Error("Gemini model " + currentModel + " is in rate-limit cooldown.");
      continue;
    }
    if (cooldownUntil) geminiModelCooldowns.delete(currentModel);

    let switchModel = false;
    let rateLimitedKeys = 0;

    for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex += 1) {
      const url = new URL(base + "/models/" + encodeURIComponent(currentModel) + ":generateContent");
      url.searchParams.set("key", GEMINI_API_KEYS[keyIndex]);

      let response;
      try {
        response = await request(url.toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          headersTimeout: GEMINI_REQUEST_TIMEOUT_MS,
          bodyTimeout: GEMINI_REQUEST_TIMEOUT_MS,
        });
      } catch (error) {
        lastError = error;
        log("Gemini model " + currentModel + ", key " + (keyIndex + 1) + "/" + GEMINI_API_KEYS.length + " request failed (" + (error && error.code ? error.code : error.message) + "); trying the next configured key.");
        continue;
      }

      if (response.statusCode < 400) {
        geminiModelCooldowns.delete(currentModel);
        if (currentModel !== modelName) {
          log("Gemini fallback model succeeded: " + currentModel + ".");
        }
        return response.body.json();
      }

      let details = "";
      try {
        details = String(await response.body.text());
      } catch {}

      lastError = new Error("Gemini generateContent failed: model " + currentModel + ", HTTP " + response.statusCode + (details ? " - " + details : ""));

      if (response.statusCode === 429) rateLimitedKeys += 1;

      if (response.statusCode === 503 || response.statusCode === 502 || response.statusCode === 504) {
        log("Gemini model " + currentModel + " returned HTTP " + response.statusCode + "; switching to the next fallback model.");
        switchModel = true;
        break;
      }

      if (![401, 403, 429, 500].includes(response.statusCode)) {
        throw lastError;
      }

      log("Gemini model " + currentModel + ", key " + (keyIndex + 1) + "/" + GEMINI_API_KEYS.length + " failed with HTTP " + response.statusCode + "; trying the next configured key.");
    }

    if (!switchModel && GEMINI_API_KEYS.length > 0 && rateLimitedKeys === GEMINI_API_KEYS.length) {
      geminiModelCooldowns.set(currentModel, Date.now() + GEMINI_MODEL_COOLDOWN_MS);
      log("All configured keys returned HTTP 429 for Gemini model " + currentModel + "; skipping it for " + Math.ceil(GEMINI_MODEL_COOLDOWN_MS / 1000) + "s before retrying it.");
    }

    if (modelIndex < models.length - 1) {
      log("Gemini model " + currentModel + " did not succeed; trying fallback model " + models[modelIndex + 1] + ".");
    }
  }

  throw lastError || new Error("Aucune clé ou aucun modèle Gemini disponible.");
}
async function generateChatCompletionTextWithGemini(messages) {
  const mapped = mapOpenAiMessagesToVertex(messages);
  if (!mapped.contents.length) return null;
  const body = { contents: mapped.contents, generationConfig: { temperature: 0.55, maxOutputTokens: CHAT_MAX_TOKENS } };
  if (mapped.systemInstruction) body.systemInstruction = mapped.systemInstruction;
  const data = await callGeminiGenerateContent(GEMINI_MODEL, body);
  const candidate = data && data.candidates && data.candidates[0];
  if (candidate && candidate.safetyRatings && candidate.safetyRatings.some((rating) => rating.blocked === true)) return "Je ne peux pas répondre à cette demande. Essaie de la reformuler.";
  const text = candidate && candidate.content && candidate.content.parts ? candidate.content.parts.map((part) => typeof part.text === "string" ? part.text : "").join(" ").trim() : "";
  return normalizeTranscriptText(text);
}
async function generateChatCompletionTextWithVertex(messages) {
  const { systemInstruction, contents } = mapOpenAiMessagesToVertex(messages);

  if (contents.length === 0) {
    return null;
  }

  const body = {
    contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: CHAT_MAX_TOKENS,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const response = await request(buildVertexGenerateContentUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.statusCode >= 400) {
    let details = "";
    try {
      details = String(await response.body.text());
    } catch {
      // ignore parse errors
    }
    throw new Error(
      `Vertex generateContent failed: HTTP ${response.statusCode}${details ? ` - ${details}` : ""}`,
    );
  }

  const data = await response.body.json();
  const candidate = data?.candidates?.[0];
  const finishReason = String(candidate?.finishReason || "");
  const blocked = candidate?.safetyRatings?.some((rating) => rating?.blocked === true);

  if (blocked) {
    return "Je ne peux pas répondre correctement pour le moment. Essaie de reformuler.";
  }

  const text = candidate?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();

  if (!text && finishReason) {
    log(`Vertex finishReason ohne Text: ${finishReason}`);
  }

  return normalizeTranscriptText(text);
}

async function generateReply(session, userId, transcript, decision = null) {
  const guild = client.guilds.cache.get(session.guildId);
  const member = guild?.voiceStates?.cache.get(userId)?.member || guild?.members?.cache.get(userId);
  const username = member?.displayName || member?.user?.username || "User";

  try {
    const memory = session.memory;
    const likelyGibberish = Boolean(decision?.likelyGibberish);
    const directedAtBot = Boolean(decision?.directedAtBot);
    const hardReply = buildHardCapabilityReply(transcript);

    if (hardReply) {
      const now = Date.now();
      appendConversationHistory(
        memory,
        { role: "user", content: trimForMemory(`${username} sagt im Sprachchat: ${transcript}`) },
        { role: "assistant", content: hardReply },
      );
      memory.lastReplyAt = now;
      memory.lastReplyByUser.set(userId, now);
      memory.lastTouchedAt = now;

      const textChannel = client.channels.cache.get(session.textChannelId);
      if (textChannel && textChannel.isTextBased()) {
        void sendDialogueLog(session, `**${username}:** ${transcript}\n**Bot:** ${hardReply}`);
      }

      return hardReply;
    }

    if (likelyGibberish) {
      if (!directedAtBot) {
        return null;
      }

      const fallbackReply =
        "Je n’ai compris que quelques morceaux. Répète plus lentement ou plus brièvement, s’il te plaît.";
      const now = Date.now();
      appendConversationHistory(
        memory,
        { role: "user", content: trimForMemory(`${username} sagt im Sprachchat: ${transcript}`) },
        { role: "assistant", content: fallbackReply },
      );
      memory.lastReplyAt = now;
      memory.lastReplyByUser.set(userId, now);
      memory.lastTouchedAt = now;

      const textChannel = client.channels.cache.get(session.textChannelId);
      if (textChannel && textChannel.isTextBased()) {
        void sendDialogueLog(session, `**${username}:** ${transcript}\n**Bot:** ${fallbackReply}`);
      }

      return fallbackReply;
    }

    const userMessage = `${username} sagt im Sprachchat: ${transcript}`;
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...memory.history,
      { role: "user", content: userMessage },
    ];

    const reply = await generateChatCompletionText(messages);
    if (!reply) return null;

    const clippedReply = clipForTts(reply);
    const memoryReply = trimForMemory(reply);
    const now = Date.now();

    appendConversationHistory(
      memory,
      { role: "user", content: trimForMemory(userMessage) },
      { role: "assistant", content: memoryReply },
    );
    memory.lastReplyAt = now;
    memory.lastReplyByUser.set(userId, now);
    memory.lastTouchedAt = now;

    const textChannel = client.channels.cache.get(session.textChannelId);
    if (textChannel && textChannel.isTextBased()) {
      void sendDialogueLog(session, `**${username}:** ${transcript}\n**Bot:** ${memoryReply}`);
    }

    return clippedReply;
  } catch (error) {
    log(`[${session.guildId}] Chat error`, error);
    return null;
  }
}

function clipForTts(text) {
  const singleLine = normalizeTranscriptText(text);
  if (singleLine.length <= MAX_TTS_CHARS) return singleLine;

  const searchWindow = singleLine.slice(0, MAX_TTS_CHARS + 500);
  const sentenceBoundary = Math.max(
    searchWindow.lastIndexOf(". "),
    searchWindow.lastIndexOf("! "),
    searchWindow.lastIndexOf("? "),
  );

  if (sentenceBoundary >= 0) {
    return searchWindow.slice(0, sentenceBoundary + 1).trim();
  }

  return singleLine;
}

async function speakReply(session, text) {
  try {
    const audioBuffer = await synthesizeSpeech(text);
    const resource = createAudioResource(Readable.from([audioBuffer]), {
      inputType: StreamType.Arbitrary,
    });

    session.player.play(resource);
    await entersState(session.player, AudioPlayerStatus.Playing, 15_000);
    await entersState(session.player, AudioPlayerStatus.Idle, 90_000);
  } catch (error) {
    log(`[${session.guildId}] TTS/playback error`, error);

    const textChannel = client.channels.cache.get(session.textChannelId);
    const now = Date.now();
    const shouldNotify =
      now - (session.memory?.lastTtsErrorNotifyAt || 0) >= TTS_ERROR_NOTIFY_COOLDOWN_MS;

    if (textChannel && textChannel.isTextBased() && shouldNotify) {
      session.memory.lastTtsErrorNotifyAt = now;
      void textChannel.send(
        `La réponse vocale a échoué. Je continue à répondre dans le chat. Cause : ${String(
          error?.message || error,
        ).slice(0, 180)}`,
      );
    }
  }
}

async function synthesizeSpeech(text) {
  if (TTS_PROVIDER === "elevenlabs") {
    if (!ELEVENLABS_API_KEY) {
      log("ElevenLabs-Key fehlt, nutze Google-TTS-Fallback.");
      return synthesizeWithGoogle(text);
    }

    try {
      return await synthesizeWithElevenLabs(text);
    } catch (error) {
      log("ElevenLabs TTS fehlgeschlagen, nutze Google-TTS-Fallback.", error);
      return synthesizeWithGoogle(text);
    }
  }

  return synthesizeWithGoogle(text);
}

async function synthesizeWithGoogle(text) {
  const cleanText = normalizeTranscriptText(text);
  const commonOptions = {
    lang: GOOGLE_TTS_LANGUAGE,
    slow: false,
    host: "https://translate.google.com",
  };

  if (cleanText.length < 200) {
    const url = googleTTS.getAudioUrl(cleanText, commonOptions);
    const response = await request(url);
    if (response.statusCode >= 400) {
      throw new Error(`Google TTS request failed: HTTP ${response.statusCode}`);
    }
    return Buffer.from(await response.body.arrayBuffer());
  }

  // google-tts-api limitiert getAudioUrl() auf <200 Zeichen.
  const chunks = googleTTS.getAllAudioUrls(cleanText, {
    ...commonOptions,
    splitPunct: ".,!?;:，。！？；：",
  });

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Google TTS konnte keine Audio-Chunks erzeugen.");
  }

  const buffers = [];
  for (const chunk of chunks) {
    const response = await request(chunk.url);
    if (response.statusCode >= 400) {
      throw new Error(`Google TTS chunk request failed: HTTP ${response.statusCode}`);
    }
    buffers.push(Buffer.from(await response.body.arrayBuffer()));
  }

  return Buffer.concat(buffers);
}

async function synthesizeWithElevenLabs(text) {
  const baseUrl = ELEVENLABS_BASE_URL.replace(/\/+$/, "");
  const url =
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}` +
    "?output_format=mp3_44100_128";
  const voiceSettings = resolveElevenLabsVoiceSettings();

  const payload = {
    text,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: voiceSettings,
  };

  // Nur setzen, wenn ein einfacher Sprachcode genutzt wird (z. B. "de", "en").
  if (/^[a-z]{2}(-[A-Z]{2})?$/i.test(BOT_LANGUAGE)) {
    payload.language_code = STT_LANGUAGE;
  }

  const response = await request(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (response.statusCode >= 400) {
    let details = "";
    try {
      details = String(await response.body.text());
    } catch {
      // ignore parse errors
    }
    throw new Error(
      `ElevenLabs TTS request failed: HTTP ${response.statusCode}${details ? ` - ${details}` : ""}`,
    );
  }

  return Buffer.from(await response.body.arrayBuffer());
}

async function joinForMessage(message) {
  const voiceChannel = getMemberVoiceChannel(message);
  if (!voiceChannel) {
    await message.reply("Tu dois être dans un salon vocal.");
    return;
  }

  const guildId = message.guild.id;
  const existing = sessions.get(guildId);

  if (existing) {
    existing.textChannelId = message.channel.id;
    if (existing.voiceChannelId === voiceChannel.id) {
      await message.reply("Je suis déjà dans ton salon vocal et j’écoute.");
      return;
    }
    await destroySession(guildId);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    log(`[${guildId}] Voice state: ${oldState.status} -> ${newState.status}`);
  });
  connection.on('error', (error) => {
    log(`[${guildId}] Voice error`, error);
  });


  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 45_000);

    const session = createSession(guildId, connection, message.channel.id, voiceChannel.id);
    sessions.set(guildId, session);

    await message.reply(
      `J’ai rejoint le salon vocal **${voiceChannel.name}**. J’écoute et je réponds à voix haute.`,
    );
  } catch (error) {
    connection.destroy();
    log(`[${guildId}] Failed to join voice`, error);
    await message.reply("Impossible de rejoindre le salon vocal.");
  }
}

async function destroySession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  session.destroyed = true;
  sessions.delete(guildId);

  try {
    session.player.stop(true);
  } catch {
    // ignore
  }

  try {
    session.connection.destroy();
  } catch {
    // ignore
  }
}

async function handleSayCommand(message, text) {
  const session = sessions.get(message.guild.id);
  if (!session) {
    await message.reply("Je ne suis dans aucun salon vocal. Utilise d’abord `!join`.");
    return;
  }

  const clipped = clipForTts(text || "Bonjour.");
  await enqueueSessionWork(session, async () => {
    await speakReply(session, clipped);
  });
  await message.reply(`Je prononce : "${clipped}"`);
}

client.once("ready", async () => {
  await ensureRecordingsDir();
  log(`Bot online als ${client.user.tag}`);
  log(`Prefix: ${PREFIX}`);
  log(
    `LLM Provider: ${LLM_PROVIDER}${
      LLM_PROVIDER === "groq"
        ? ` (model=${GROQ_CHAT_MODEL})`
        : ` (model=${VERTEX_MODEL}, location=${VERTEX_PROJECT_ID ? VERTEX_LOCATION : "express"})`
    }`,
  );
  log(
    `TTS Provider: ${TTS_PROVIDER}${
      TTS_PROVIDER === "elevenlabs"
        ? ` (voice=${ELEVENLABS_VOICE_ID}, preset=${ELEVENLABS_VOICE_PRESET})`
        : ""
    }`,
  );
  log(`Sprache: STT=${STT_LANGUAGE}, TTS=${GOOGLE_TTS_LANGUAGE}/${BOT_LANGUAGE}`);
  log(
    `Reply-Filter: global=${GLOBAL_REPLY_COOLDOWN_MS}ms user=${USER_REPLY_COOLDOWN_MS}ms echo=${BOT_ECHO_GUARD_MS}ms dup=${DUPLICATE_TRANSCRIPT_WINDOW_MS}ms`,
  );
  log(`Memory: messages=${MEMORY_MAX_MESSAGES}, chars=${MEMORY_MAX_CHARS}, TTS max chars=${MAX_TTS_CHARS}`);
  for (const guild of client.guilds.cache.values()) {
    log(
      `[${guild.id}] Auto-Join Voice: ${isAutoJoinEnabled(guild.id) ? "aktiv" : "deaktiviert"} (leave cooldown=${AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS}ms)`,
    );
    if (isAutoJoinEnabled(guild.id)) {
      enqueueAutoJoinReconcile(guild, "startup");
    }
  }

  // --- CLOUD RUN HEALTH-CHECK SERVER ---
  // Cloud Run expects a service to listen on a port to confirm it's healthy.
  const http = require("node:http");
  const PORT = process.env.PORT || 8080;
  const healthServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot OK!");
  });
  healthServer.listen(PORT, "0.0.0.0", () => {
      log(`[System] Health-check server listening on port ${PORT} (Cloud Run compatibility)`);
  });

  // La connexion vocale est gérée par le mécanisme Auto-Join ci-dessus.

});

client.on("voiceStateUpdate", (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  if (!guild || !isAutoJoinEnabled(guild.id)) return;

  const member = newState.member || oldState.member;
  if (member?.user?.bot) return;

  enqueueAutoJoinReconcile(guild, "voice-state-update");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [rawCommand, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (rawCommand || "").toLowerCase();
  const argText = rest.join(" ").trim();

  try {
    if (["logs", "dialoguelogs"].includes(command)) {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) { await message.reply("Il faut la permission **Gérer le serveur** pour modifier ces réglages."); return; }
      const settings = getDialogueLogSettings(message.guild.id);
      const action = (rest[0] || "").toLowerCase();
      if (action === "on") { settings.enabled = true; await message.reply("Affichage des dialogues réactivé."); }
      else if (action === "off") { settings.enabled = false; await message.reply("Affichage des dialogues désactivé."); }
      else if (action === "salon" || action === "channel") {
        const channelId = rest[1]?.replace(/[<#>]/g, "");
        const channel = channelId ? message.guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isTextBased()) { await message.reply("Utilise `" + PREFIX + "logs salon #nom-du-salon` ou `" + PREFIX + "logs salon ID_DU_SALON`."); return; }
        settings.channelId = channel.id; await message.reply("Les dialogues seront envoyés dans " + channel.toString() + ".");
      } else if (action === "reset") { settings.channelId = null; await message.reply("Le salon des dialogues revient au salon texte par défaut."); }
      else { await message.reply(["**Réglages des dialogues**", "`" + PREFIX + "logs on` - Afficher les dialogues", "`" + PREFIX + "logs off` - Masquer les dialogues", "`" + PREFIX + "logs salon #salon` - Choisir le salon de logs", "`" + PREFIX + "logs reset` - Revenir au salon par défaut", "État : " + (settings.enabled ? "activé" : "désactivé"), "Salon : " + (settings.channelId ? "<#" + settings.channelId + ">" : "par défaut")].join("\n")); }
      return;
    }

    if (["autoreconnect", "autorejoin", "autojoin"].includes(command)) {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) { await message.reply("Il faut la permission **Gérer le serveur** pour modifier ce réglage."); return; }
      const action = (rest[0] || "").toLowerCase();
      if (action === "on") { autoJoinOverrides.set(message.guild.id, true); await message.reply("Reconnexion automatique activée."); }
      else if (action === "off") { autoJoinOverrides.set(message.guild.id, false); await message.reply("Reconnexion automatique désactivée."); }
      else { await message.reply("Utilise `" + PREFIX + "autoreconnect on` ou `" + PREFIX + "autoreconnect off`. État actuel : " + (isAutoJoinEnabled(message.guild.id) ? "activée" : "désactivée") + "."); }
      return;
    }
    if (command === "join") {
      await joinForMessage(message);
      return;
    }

    if (command === "testchannels") {
      await message.reply("Je teste les salons vocaux du serveur...");
      const voiceChannels = message.guild.channels.cache.filter(c => c.isVoiceBased());
      let success = false;
      
      for (const [id, vc] of voiceChannels) {
        await message.channel.send(`Test de connexion à **${vc.name}**...`);
        const connection = joinVoiceChannel({
          channelId: vc.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
          debug: true,
        });

        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
          await message.channel.send(`✅ Connexion réussie à **${vc.name}** ! L’audio fonctionne.`);
          
          const session = createSession(message.guild.id, connection, message.channel.id, vc.id);
          sessions.set(message.guild.id, session);
          success = true;
          break; // Stop testing if we found a working channel
        } catch (error) {
          connection.destroy();
          await message.channel.send(`❌ Échec de connexion à **${vc.name}** après 15 secondes (délai UDP dépassé).`);
        }
      }
      
      if (!success) {
        await message.channel.send("J’ai testé tous les salons, mais aucune connexion audio n’a pu être établie.");
      }
      return;
    }

    if (command === "leave") {
      if (isAutoJoinEnabled(message.guild.id)) {
        setAutoJoinCooldown(message.guild.id, AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS);
      }
      await destroySession(message.guild.id);
      await message.reply(
        isAutoJoinEnabled(message.guild.id)
          ? `Salon vocal quitté. Reconnexion automatique suspendue pendant ${Math.round(
              AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS / 1000,
            )} s.`
          : "Salon vocal quitté.",
      );
      return;
    }

    if (command === "say") {
      await handleSayCommand(message, argText);
      return;
    }

    if (command === "help") {
      await message.reply(
        [
          `**Commandes (${PREFIX})**`,
          `${PREFIX}join - Rejoindre le salon vocal et écouter`,
          `${PREFIX}leave - Quitter le salon vocal`,
          `${PREFIX}say <texte> - Tester la réponse vocale`,
          `${PREFIX}logs on/off - Activer ou masquer les dialogues en texte`,
          `${PREFIX}logs salon #salon - Choisir le salon de logs`,
          `${PREFIX}autoreconnect on/off - Activer ou désactiver la reconnexion automatique`,
          `Rejoindre automatiquement : ${isAutoJoinEnabled(message.guild.id) ? "activé" : "désactivé"}`,
          `${PREFIX}help - Afficher l’aide`,
        ].join("\n"),
      );
      return;
    }
  } catch (error) {
    log("Command error", error);
    await message.reply("Une erreur est survenue pendant l’exécution de la commande.");
  }
});

client.on("error", (error) => {
  log("Discord client error", error);
});

process.on("SIGINT", async () => {
  for (const guildId of [...sessions.keys()]) {
    await destroySession(guildId);
  }
  client.destroy();
  process.exit(0);
});

let discordLoginAttempt = 0;
let discordLoginRetryTimer = null;

async function loginToDiscord() {
  if (discordLoginRetryTimer) {
    clearTimeout(discordLoginRetryTimer);
    discordLoginRetryTimer = null;
  }

  discordLoginAttempt += 1;
  try {
    await client.login(process.env.DISCORD_TOKEN);
    discordLoginAttempt = 0;
  } catch (error) {
    const delay = Math.min(60_000, 5_000 * 2 ** Math.min(discordLoginAttempt - 1, 4));
    log(`Discord login failed (attempt ${discordLoginAttempt}); retrying in ${Math.round(delay / 1000)}s.`, error);
    discordLoginRetryTimer = setTimeout(() => {
      void loginToDiscord();
    }, delay);
    discordLoginRetryTimer.unref?.();
  }
}

void loginToDiscord();
