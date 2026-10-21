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

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
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

const BOT_LANGUAGE = "fr";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";
const GROQ_TRANSCRIBE_MODEL =
  process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const GROQ_API_KEYS = [...new Set([
  process.env.GROQ_API_KEY,
  ...Object.entries(process.env)
    .filter(([name]) => /^GROQ_API_KEY\d+$/.test(name))
    .sort(([a], [b]) => Number(a.slice("GROQ_API_KEY".length)) - Number(b.slice("GROQ_API_KEY".length)))
    .map(([, value]) => value),
].map((key) => String(key || "").trim()).filter(Boolean))];
const GROQ_TRANSCRIPTION_CLIENTS = GROQ_API_KEYS.map((apiKey) => new OpenAI({
  apiKey,
  baseURL: GROQ_BASE_URL,
}));
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
const CHAT_MAX_TOKENS = parseEnvInt(process.env.CHAT_MAX_TOKENS, 450);
const MAX_TTS_CHARS = parseEnvInt(process.env.MAX_TTS_CHARS, 1200);
const MEMORY_MAX_MESSAGES = parseEnvInt(process.env.MEMORY_MAX_MESSAGES, 24);
const MEMORY_MAX_CHARS = parseEnvInt(process.env.MEMORY_MAX_CHARS, 7000);
const BOT_WAKE_WORDS = parseCsvEnv(process.env.BOT_WAKE_WORDS, ["discord bot", "chatia", "chat ia", "tchatteia", "tchatte ia", "tchatia", "tchat ia", "chat y a", "chati a"]).filter((wakeWord) => !["bot", "chatgpt", "chat gpt", "tchatgpt", "tchat gpt"].includes(canonicalizeWakeWord(wakeWord)));
const IGNORE_COURTESY_ONLY = parseEnvBool(process.env.IGNORE_COURTESY_ONLY, true);
const TTS_ERROR_NOTIFY_COOLDOWN_MS = parseEnvInt(process.env.TTS_ERROR_NOTIFY_COOLDOWN_MS, 60000);
const MIN_PCM_BYTES = parseEnvInt(process.env.MIN_PCM_BYTES, 60_000);
const RECORDINGS_DIR = path.join(process.cwd(), "tmp-recordings");
const STT_LANGUAGE = normalizeSttLanguage(BOT_LANGUAGE);
const GOOGLE_TTS_LANGUAGE = normalizeGoogleTtsLanguage(BOT_LANGUAGE);

if (LLM_PROVIDER !== "gemini" && GROQ_API_KEYS.length === 0) {
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
  apiKey: GROQ_API_KEYS[0] || "not-used-with-gemini",
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
const pendingVoiceActions = new Map();
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

function buildSystemPrompt(serverContext = "") {
  return [
    "Tu es un assistant vocal Discord qui parle naturellement en français.",
    "Réponds toujours en français, sauf si la personne demande explicitement une traduction.",
    "Réponds uniquement à la personne qui t’interpelle ou te pose directement une question.",
    "Pour une question simple, réponds brièvement. Pour une question complexe, utilise 2 à 5 phrases.",
    "Si l’audio est incompréhensible, demande brièvement de répéter et n’invente aucun détail.",
    "Évite les phrases de remplissage, les présentations répétitives et les émojis.",
    "Ne répète pas les insultes ni les propos discriminatoires.",
    "Tu peux répondre aux questions sur le serveur avec le contexte de serveur fourni ci-dessous, mais n’invente jamais une information absente.",
    "RÈGLE DE CONFIDENTIALITÉ ABSOLUE : ne révèle jamais les journaux/logs, les salons réservés au staff, à la modération ou aux administrateurs, les tickets privés, ni aucun salon ou contenu inaccessible à un membre ordinaire. Ne confirme même pas le nom, l’existence ou le contenu d’un salon exclu. Si on te demande ces informations, explique simplement que tu ne peux pas divulguer les espaces privés ou les journaux.",
    "Utilise uniquement les informations du contexte serveur explicitement marquées comme autorisées. Ne déduis pas le nom ou l’existence d’espaces privés à partir d’autres informations.",
    "Tu es un bot vocal Discord. Ne prétends pas effectuer des actions externes.",
    "Si une action n’est pas possible, explique-le brièvement et mentionne uniquement les commandes réelles (!join, !leave, !help).",
    serverContext ? "Contexte autorisé du serveur :\n" + serverContext : "",
  ].filter(Boolean).join(" ");
}

function isSensitiveChannelName(name) {
  const normalized = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /(^|[-_ ])(logs?|journal|audit|modlogs?|staff|moderation|moderateurs?|administration|admins?|tickets?|support-prive|private)([-_ ]|$)/i.test(normalized);
}

async function buildSafeGuildContext(guild, member, preferredChannel = null, transcript = "", sharedVoiceChannel = null) {
  if (!guild || !member) return "";
  const visibleChannels = [];
  const readableTextChannels = [];
  const sensitiveCategoryIds = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory && isSensitiveChannelName(channel.name)) sensitiveCategoryIds.add(channel.id);
  }
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory) continue;
    if (channel.parentId && sensitiveCategoryIds.has(channel.parentId)) continue;
    if (isSensitiveChannelName(channel.name)) continue;
    const permissions = channel.permissionsFor(member);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) continue;
    const sharedMembers = sharedVoiceChannel
      ? [...sharedVoiceChannel.members.values()].filter((voiceMember) => !voiceMember.user?.bot)
      : [];
    const visibleToEveryoneInVoice = !sharedVoiceChannel || sharedMembers.every((voiceMember) =>
      channel.permissionsFor(voiceMember)?.has(PermissionFlagsBits.ViewChannel),
    );
    if (!visibleToEveryoneInVoice) continue;
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
      visibleChannels.push("#" + channel.name);
      if (permissions.has(PermissionFlagsBits.ReadMessageHistory) && (!sharedVoiceChannel || sharedMembers.every((voiceMember) =>
        channel.permissionsFor(voiceMember)?.has(PermissionFlagsBits.ReadMessageHistory),
      ))) readableTextChannels.push(channel);
    } else if (channel.type === ChannelType.GuildVoice) visibleChannels.push("vocal: " + channel.name);
    else if (channel.type === ChannelType.GuildStageVoice) visibleChannels.push("scène: " + channel.name);
    else if (channel.type === ChannelType.GuildForum) visibleChannels.push("forum: " + channel.name);
  }
  const roles = [...guild.roles.cache.values()].filter((role) => role.id !== guild.id && !isSensitiveChannelName(role.name)).map((role) => role.name).slice(0, 40);
  const cachedMembers = [...guild.members.cache.values()].filter((entry) => !entry.user?.bot).map((entry) => entry.displayName || entry.user?.username).filter(Boolean).slice(0, 30);
  const normalizedRequest = " " + canonicalizeWakeWord(transcript).normalize("NFD").replace(/\p{Diacritic}/gu, "") + " ";
  const mentionedChannels = readableTextChannels.filter((channel) => {
    const normalizedName = canonicalizeWakeWord(channel.name).normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return normalizedName.length >= 4 && normalizedRequest.includes(" " + normalizedName + " ");
  });
  const preferred = preferredChannel && readableTextChannels.find((channel) => channel.id === preferredChannel.id);
  const messageChannels = [...new Map([...mentionedChannels, ...(preferred ? [preferred] : []), ...readableTextChannels].map((channel) => [channel.id, channel])).values()].slice(0, 5);
  const recentMessages = [];
  for (const channel of messageChannels) {
    try {
      const fetched = await channel.messages.fetch({ limit: mentionedChannels.some((mentioned) => mentioned.id === channel.id) ? 10 : 4 });
      recentMessages.push(...[...fetched.values()].filter((message) => !message.author.bot && message.content?.trim()).sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((message) => "[" + channel.name + "] " + (message.member?.displayName || message.author.username) + " : " + normalizeTranscriptText(message.content).slice(0, 220)));
    } catch {}
    if (recentMessages.length >= 12) break;
  }
  return [
    "Nom du serveur : " + guild.name,
    guild.description ? "Description : " + guild.description : "",
    "Nombre de membres : " + guild.memberCount,
    "Salons visibles par ce membre : " + (visibleChannels.slice(0, 80).join(", ") || "aucun salon autorisé disponible"),
    "Rôles non sensibles : " + (roles.join(", ") || "aucun"),
    "Membres non-bots actuellement en cache (liste partielle, maximum 30) : " + (cachedMembers.join(", ") || "aucun membre en cache"),
    "Messages récents de salons lisibles et non sensibles, partagés avec tous les membres du vocal si la demande vient du vocal : " + (recentMessages.slice(0, 12).join("\n") || "aucun message récent disponible"),
  ].filter(Boolean).join("\n").slice(0, 6500);
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

function canonicalizeWakeWord(text) {
  return normalizeTranscriptText(text)
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptMentionsAnotherVoiceMember(voiceChannel, speakerUserId, transcript) {
  if (!voiceChannel?.members?.size) return false;

  const normalizedTranscript = " " + canonicalizeWakeWord(transcript).normalize("NFD").replace(/\p{Diacritic}/gu, "") + " ";
  for (const member of voiceChannel.members.values()) {
    if (member.user?.bot || member.id === speakerUserId) continue;

    const names = [member.displayName, member.user?.globalName, member.user?.username]
      .filter(Boolean)
      .map((name) => canonicalizeWakeWord(name).normalize("NFD").replace(/\p{Diacritic}/gu, ""))
      .filter((name) => name.length >= 3);

    if (names.some((name) => normalizedTranscript.includes(" " + name + " "))) {
      return true;
    }
  }

  return false;
}

function hasExplicitBotWakeWord(text) {
  const lower = normalizeTranscriptText(text).toLowerCase();
  if (!lower) return false;

  const normalizedText = " " + lower.replace(/[^a-z0-9à-ÿ]+/gi, " ") + " ";
  const wakeWords = [...new Set([
    ...BOT_WAKE_WORDS,
    "chatia",
    "chat ia",
    "chaia",
    "cha ia",
    "tjadija",
    "tja dija",
    "tchatia",
    "tchat ia",
    "tchattia",
    "tchatteia",
    "tchatte ia",
    "chat y a",
    "chati a",
  ])];
  return wakeWords.some((wakeWord) => {
    const normalizedWakeWord = wakeWord.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim();
    return normalizedWakeWord && normalizedText.includes(" " + normalizedWakeWord + " ");
  });
}

function looksDirectedAtBot(text) {
  const lower = normalizeTranscriptText(text).toLowerCase();
  if (!lower) return false;
  if (hasExplicitBotWakeWord(text)) return true;

  return /^(?:tu peux(?: me dire| expliquer)?|peux-tu|peux tu|est-ce que tu|est ce que tu|tu pourrais|pourrais-tu|pourrais tu|tu sais|tu connais|explique(?:-moi| moi)?|dis(?:-moi| moi)|réponds|reponds|aide-moi|aide moi|tu peux m'aider|tu peux m aider|kannst du|sag mal)(?:\s|$)/i.test(lower);
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
  const voiceChannel = client.channels.cache.get(session.voiceChannelId);
  const hasExplicitWakeWord = hasExplicitBotWakeWord(clean);
  const looksLikeVoiceActionTranscript = /^(?:(?:peux[- ]tu\s+)?(?:expulse|expulser|kick|vire|virer|déconnect(?:e|er)?|deconnect(?:e|er)?|déco|deco|sors|sortir|déplace|deplace|déplacer|deplacer|bouge|transfère|transfere|passe[- ]moi|passe moi|mute|muter|timeout|mettre en pause|réduire au silence)\b)/i.test(clean.replace(/^[«"']+/, "").trim());
  if (!hasExplicitWakeWord && !looksLikeVoiceActionTranscript && transcriptMentionsAnotherVoiceMember(voiceChannel, userId, clean)) {
    return { ignore: true, reason: "not-addressed-to-bot" };
  }
  const hasAddressingClue = looksDirectedAtBot(clean);
  const lastReplyToThisUser = memory.lastReplyByUser.get(userId) || 0;
  const recentConversationWithThisUser = now - lastReplyToThisUser < BOT_FOLLOW_UP_WINDOW_MS;
  const followUpText = canonical.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const shortFollowUp = /^(oui|non|ouais|nan|d accord|daccord|ok|okay|vas y|continue|pourquoi|comment ca|repete|redis|encore|exactement|c est ca|merci)$/i.test(followUpText);
  let directedAtBot = hasExplicitWakeWord || looksLikeVoiceActionTranscript;

  if (!hasExplicitWakeWord && recentConversationWithThisUser && (shortFollowUp || hasAddressingClue)) {
    directedAtBot = true;
    log(`[${session.guildId}] Accepting a plausible follow-up from the same user who recently spoke with the bot.`);
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

    log(`[${session.guildId}] Audio capturé (${pcmBytes} octets); ajout à la file de transcription.`);
    await enqueueSessionWork(session, async () => {
      try {
        const transcript = await transcribeAudio(filePath);
        if (!transcript) return;

        const decision = await shouldIgnoreTranscript(session, userId, transcript);
        if (decision.ignore) {
          log(`[${session.guildId}] Transcription ignorée (${decision.reason}) : ${transcript}`);
          return;
        }

        const voiceCommandReply = await handleVoiceServerCommand(session, userId, decision.transcript);
        const reply = voiceCommandReply || await generateReply(session, userId, decision.transcript, decision);
        if (!reply) return;

        if (voiceCommandReply) {
          session.memory.lastReplyAt = Date.now();
          session.memory.lastReplyByUser.set(userId, Date.now());
          session.memory.lastTouchedAt = Date.now();
        }
        await speakReply(session, reply);
      } finally {
        await safeUnlink(filePath);
      }
    });
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
    let text = "";
    if (GROQ_TRANSCRIPTION_CLIENTS.length > 0) {
      let lastError = null;
      for (let index = 0; index < GROQ_TRANSCRIPTION_CLIENTS.length; index += 1) {
        try {
          const payload = {
            file: fs.createReadStream(filePath),
            model: GROQ_TRANSCRIBE_MODEL,
            language: STT_LANGUAGE,
            temperature: 0,
          };
          if (STT_LANGUAGE === "fr") payload.prompt = "Conversation vocale Discord entre amis, en français. Le nom du bot est ChatIA, prononcé « chat i a ». Il peut être prononcé ou reconnu comme Chat IA, TchatIA, Tchattia, Cha-IA, Tjadija ou « allô ». Garde exactement les mots réellement prononcés, surtout les noms propres et les appels au bot. Ne produis jamais de texte de sous-titrage, de crédit de sous-titrage, de commentaire ou de traduction. Si la parole est inaudible, retourne une transcription vide plutôt que d’inventer des mots.";
          if (STT_LANGUAGE === "de") payload.prompt = "Discord Voice Chat auf Deutsch. Transkribiere natürlich auf Deutsch, keine Übersetzung.";
          const result = await GROQ_TRANSCRIPTION_CLIENTS[index].audio.transcriptions.create(payload);
          text = result && result.text ? result.text : "";
          log("Groq transcription succeeded using configured key slot " + (index + 1) + ".");
          break;
        } catch (error) {
          lastError = error;
          const status = Number(error?.status || error?.statusCode || 0);
          log("Groq transcription key slot " + (index + 1) + " failed with status " + (status || "network error") + "; trying the next configured key if available.");
        }
      }
      if (!text && lastError) throw new Error("All configured Groq transcription keys failed: " + String(lastError?.status || lastError?.statusCode || lastError?.message || "unknown error"));
    } else if (LLM_PROVIDER === "gemini") {
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
      throw new Error("No Groq transcription key is configured.");
    }
    text = normalizeTranscriptText(text);
    await safeUnlink(filePath);
    if (!text) return null;
    log("Transcription : " + text);
    return text;
  } catch (error) {
    log("Transcription error", error?.message || error);
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
const geminiKeyCooldowns = new Map();

async function callGeminiGenerateContent(modelName, body) {
  const base = GEMINI_BASE_URL.replace(/\/+$/, "");
  const fallbackModels = parseCsvEnv(
    process.env.GEMINI_FALLBACK_MODELS,
    ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
  );
  const models = [...new Set([modelName, ...fallbackModels].map((name) => String(name || "").trim()).filter(Boolean))];
  let lastError = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const currentModel = models[modelIndex];
    const now = Date.now();
    const cooldownUntil = geminiModelCooldowns.get(currentModel) || 0;
    if (cooldownUntil > now) {
      log("Gemini model " + currentModel + " is rate-limited; skipping it for " + Math.ceil((cooldownUntil - now) / 1000) + "s and trying the next model.");
      lastError = new Error("Gemini model " + currentModel + " is in rate-limit cooldown.");
      continue;
    }
    if (cooldownUntil) geminiModelCooldowns.delete(currentModel);

    let switchModel = false;
    let rateLimitedKeys = 0;
    let availableKeys = 0;

    for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex += 1) {
      const keyCooldownId = currentModel + ":" + keyIndex;
      const keyCooldownUntil = geminiKeyCooldowns.get(keyCooldownId) || 0;
      if (keyCooldownUntil > Date.now()) {
        log("Gemini model " + currentModel + ", key " + (keyIndex + 1) + "/" + GEMINI_API_KEYS.length + " is in rate-limit cooldown; skipping it.");
        continue;
      }
      if (keyCooldownUntil) geminiKeyCooldowns.delete(keyCooldownId);
      availableKeys += 1;

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
        geminiKeyCooldowns.delete(keyCooldownId);
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

      if (response.statusCode === 429) {
        rateLimitedKeys += 1;
        geminiKeyCooldowns.set(keyCooldownId, Date.now() + GEMINI_MODEL_COOLDOWN_MS);
      }

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

    if (availableKeys === 0) {
      lastError = new Error("All API keys for Gemini model " + currentModel + " are in rate-limit cooldown.");
    }

    if (!switchModel && availableKeys > 0 && rateLimitedKeys === availableKeys) {
      geminiModelCooldowns.set(currentModel, Date.now() + GEMINI_MODEL_COOLDOWN_MS);
      log("All available keys returned HTTP 429 for Gemini model " + currentModel + "; skipping it for " + Math.ceil(GEMINI_MODEL_COOLDOWN_MS / 1000) + "s before retrying it.");
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
  const finishReason = String(candidate?.finishReason || "");
  if (finishReason && finishReason !== "STOP") {
    log("Gemini response ended with finishReason=" + finishReason + "; output token limit=" + CHAT_MAX_TOKENS + ".");
  }
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

function stripBotWakeWord(transcript) {
  const original = normalizeTranscriptText(transcript);
  const normalized = canonicalizeWakeWord(original);
  const variants = [...new Set([...BOT_WAKE_WORDS, "chatia", "chat ia", "chaia", "cha ia", "tjadija", "tja dija", "tchatia", "tchat ia", "tchattia", "tchatteia", "tchatte ia", "chat y a", "chati a"])]
    .map((word) => canonicalizeWakeWord(word))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const word of variants) {
    if (normalized === word) return "";
    if (normalized.startsWith(word + " ")) {
      const wordCount = word.split(" ").length;
      return original.split(/\s+/).slice(wordCount).join(" ").replace(/^[,;:.!?-]+/, "").trim();
    }
  }
  return original;
}

function normalizeMemberSearch(value) {
  return canonicalizeWakeWord(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function findVoiceCommandTarget(guild, targetText) {
  const target = normalizeMemberSearch(targetText);
  if (!target || target.length < 2) return { member: null, reason: "missing-target" };
  let candidates = [...guild.members.cache.values()].filter((entry) => !entry.user?.bot);
  const exact = candidates.filter((entry) => [entry.displayName, entry.user?.globalName, entry.user?.username]
    .filter(Boolean).some((name) => normalizeMemberSearch(name) === target));
  if (exact.length === 1) return { member: exact[0] };
  if (exact.length > 1) return { member: null, reason: "ambiguous-target" };
  try {
    const fetched = await guild.members.fetch({ query: targetText, limit: 10 });
    candidates = [...new Map([...candidates, ...fetched.values()].map((entry) => [entry.id, entry])).values()];
  } catch {}
  const partial = candidates.filter((entry) => [entry.displayName, entry.user?.globalName, entry.user?.username]
    .filter(Boolean).some((name) => {
      const normalizedName = normalizeMemberSearch(name);
      return normalizedName === target || normalizedName.startsWith(target + " ") || target.startsWith(normalizedName + " ");
    }));
  if (partial.length === 1) return { member: partial[0] };
  return { member: null, reason: partial.length > 1 ? "ambiguous-target" : "unknown-target" };
}

async function handleVoiceServerCommand(session, userId, transcript) {
  const guild = client.guilds.cache.get(session.guildId);
  if (!guild) return null;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  const hasWakeWord = hasExplicitBotWakeWord(transcript);
  const rawCommand = hasWakeWord ? stripBotWakeWord(transcript) : normalizeTranscriptText(transcript);
  const commandText = rawCommand.replace(/^[«"']+|[»"']+$/g, "").replace(/[.!?]+$/g, "").trim();
  const looksLikeVoiceAction = /^(?:(?:peux[- ]tu\s+)?(?:expulse|expulser|kick|vire|virer|déconnect(?:e|er)?|deconnect(?:e|er)?|déco|deco|sors|sortir|déplace|deplace|déplacer|deplacer|bouge|transfère|transfere|passe[- ]moi|passe moi|mute|muter|timeout|mettre en pause|réduire au silence)\b)/i.test(commandText);
  if (!hasWakeWord && !looksLikeVoiceAction) return null;
  const pendingKey = guild.id;
  let pending = pendingVoiceActions.get(pendingKey);
  const normalizedCommand = canonicalizeTranscript(commandText);
  const confirmation = /^(oui|confirme|je confirme|confirmer|vas y|fais le|execute)$/i.test(normalizedCommand);
  const cancellation = /^(non|annule|annuler|laisse tomber|ne le fais pas)$/i.test(normalizedCommand);

  if (pending && pending.expiresAt <= Date.now()) {
    pendingVoiceActions.delete(pendingKey);
    pending = null;
  }
  if (pending && pending.requesterId === userId && confirmation) {
    pendingVoiceActions.delete(pendingKey);
    const target = await guild.members.fetch(pending.targetId).catch(() => null);
    if (!target) return "Je ne trouve plus ce membre. Action annulée.";
    const botMember = guild.members.me;
    if (!member.permissions.has(PermissionFlagsBits[pending.permission])) return "Tu n’as plus la permission nécessaire. Action annulée.";
    if (!botMember?.permissions.has(PermissionFlagsBits[pending.botPermission])) return "Je n’ai pas la permission Discord nécessaire pour faire ça.";
    if (target.id === guild.ownerId || target.id === botMember.id) return "Je ne peux pas appliquer cette action à ce membre.";
    if (pending.action !== "disconnect" && pending.action !== "move" && target.id === userId) return "Tu ne peux pas demander cette action sur toi-même.";
    if (pending.action !== "disconnect" && pending.action !== "move" && target.roles.highest.comparePositionTo(member.roles.highest) >= 0 && guild.ownerId !== userId) return "Discord empêche cette action : le rôle de cette personne est égal ou supérieur au tien.";
    if (pending.action !== "disconnect" && pending.action !== "move" && target.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) return "Discord empêche cette action : son rôle est égal ou supérieur au mien.";
    try {
      if (pending.action === "kick") {
        await target.kick("Commande vocale confirmée par " + member.user.tag);
        return "C’est fait, " + (target.displayName || target.user.username) + " a été expulsé du serveur.";
      }
      if (pending.action === "disconnect") {
        if (!target.voice.channelId) return "Cette personne n’est plus dans un salon vocal. Action annulée.";
        await target.voice.disconnect("Déconnexion vocale confirmée par " + member.user.tag);
        return "C’est fait, " + (target.displayName || target.user.username) + " a été déconnecté du salon vocal.";
      }
      if (pending.action === "move") {
        if (!target.voice.channelId) return "Cette personne n’est plus dans un salon vocal. Action annulée.";
        const destination = guild.channels.cache.get(pending.destinationChannelId);
        if (!destination || (destination.type !== ChannelType.GuildVoice && destination.type !== ChannelType.GuildStageVoice)) return "Je ne retrouve plus le salon vocal de destination. Action annulée.";
        await target.voice.setChannel(destination, "Déplacement vocal confirmé par " + member.user.tag);
        return "C’est fait, " + (target.displayName || target.user.username) + " a été déplacé dans " + destination.name + ".";
      }
      await target.timeout(pending.durationMs, "Commande vocale confirmée par " + member.user.tag);
      return "C’est fait, " + (target.displayName || target.user.username) + " est mis en pause pendant " + Math.round(pending.durationMs / 60000) + " minutes.";
    } catch (error) {
      log("Voice moderation action failed", error?.message || error);
      return "Discord a refusé l’action. Vérifie mes permissions et la hiérarchie des rôles.";
    }
  }
  if (pending && pending.requesterId === userId && cancellation) {
    pendingVoiceActions.delete(pendingKey);
    return "D’accord, j’annule l’action.";
  }

  const kickMatch = commandText.match(/^(?:peux[- ]tu\s+)?(?:expulse|expulser|kick|vire|virer)\s+(.+)$/i);
  const disconnectMatch = commandText.match(/^(?:peux[- ]tu\s+)?(?:déconnect(?:e|er)?|deconnect(?:e|er)?|déco|deco|sors|sortir)\s+(.+?)(?:\s+(?:du|des)\s+(?:salon|salons)\s+voc(?:al|ale|aux))?$/i);
  const moveMatch = commandText.match(/^(?:peux[- ]tu\s+)?(?:déplace|deplace|déplacer|deplacer|bouge|transfère|transfere|passe[- ]moi|passe moi)(?:\s+(.+?))?\s+(?:dans|vers|au|à)\s+(?:le\s+)?(?:salon\s+)?(.+)$/i);
  const timeoutMatch = commandText.match(/^(?:peux[- ]tu\s+)?(?:mute|muter|timeout|mettre en pause|réduire au silence)\s+(.+?)(?:\s+(?:pendant|pour)\s+(\d+)\s*(s|sec|secondes?|m|min|minutes?|h|heures?))?$/i);
  if (disconnectMatch && /^(?:moi|me|moi-même|moi meme)$/i.test(disconnectMatch[1].trim())) {
    return "Je ne peux pas te déconnecter toi-même avec cette commande. Si tu veux quitter le salon, utilise !leave.";
  }
  if (disconnectMatch && /^(?:le|la|lui|les|eux|elle|celui[- ]là|celle[- ]là|cette personne|cet utilisateur|ce membre)$/i.test(disconnectMatch[1].trim())) {
    return "Qui veux-tu déconnecter ? Dis « ChatIA, déconnecte [nom] du salon vocal » pour que je cible la bonne personne.";
  }
  const actionMatch = kickMatch || disconnectMatch || moveMatch || timeoutMatch;
  if (!actionMatch) return null;

  const action = kickMatch ? "kick" : disconnectMatch ? "disconnect" : moveMatch ? "move" : "timeout";
  const permission = action === "kick" ? "KickMembers" : action === "disconnect" || action === "move" ? "MoveMembers" : "ModerateMembers";
  if (!member.permissions.has(PermissionFlagsBits[permission])) {
    const permissionLabel = action === "kick" ? "Expulser des membres" : action === "disconnect" || action === "move" ? "Déplacer des membres" : "Modérer les membres";
    return "Ton compte Discord n’a pas la permission requise (" + permissionLabel + ").";
  }
  const requestedTargetText = action === "move" && (!moveMatch[1] || /^(?:moi|me|moi-même|moi meme)$/i.test(moveMatch[1].trim()))
    ? "moi"
    : actionMatch[1].trim();
  const found = /^(?:moi|me|moi-même|moi meme)$/i.test(requestedTargetText)
    ? { member }
    : await findVoiceCommandTarget(guild, requestedTargetText);
  if (!found.member) {
    if (found.reason === "ambiguous-target") return "J’ai trouvé plusieurs membres possibles. Dis son nom d’utilisateur complet pour éviter une erreur.";
    return "Je ne trouve pas ce membre. Dis son nom d’utilisateur ou son surnom exact.";
  }
  const target = found.member;
  const botMember = guild.members.me;
  if (action !== "disconnect" && action !== "move" && target.id === userId) return "Tu ne peux pas demander cette action sur toi-même.";
  if (target.id === guild.ownerId || target.id === botMember?.id) return "Je ne peux pas appliquer cette action à ce membre.";
  if (action !== "disconnect" && action !== "move" && guild.ownerId !== userId && target.roles.highest.comparePositionTo(member.roles.highest) >= 0) return "Je ne peux pas faire ça : le rôle de cette personne est égal ou supérieur au tien.";
  if (!botMember?.permissions.has(PermissionFlagsBits[permission])) return "Mon compte bot n’a pas la permission Discord requise (" + (action === "kick" ? "Expulser des membres" : action === "disconnect" || action === "move" ? "Déplacer des membres" : "Modérer les membres") + ").";
  if ((action === "disconnect" || action === "move") && !target.voice.channelId) return "Cette personne n’est actuellement dans aucun salon vocal.";
  if (action !== "disconnect" && action !== "move" && target.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) return "Je ne peux pas agir sur ce membre : son rôle est égal ou supérieur au mien.";

  let destinationChannel = null;
  if (action === "move") {
    const destinationText = normalizeMemberSearch(moveMatch[2].replace(/^(?:le\s+)?salon\s+/i, ""));
    const voiceChannels = [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice);
    const exactChannels = voiceChannels.filter((channel) => normalizeMemberSearch(channel.name) === destinationText);
    const partialChannels = exactChannels.length ? exactChannels : voiceChannels.filter((channel) => normalizeMemberSearch(channel.name).includes(destinationText));
    if (!destinationText || partialChannels.length !== 1) {
      return partialChannels.length > 1 ? "J’ai trouvé plusieurs salons vocaux possibles. Donne le nom exact du salon." : "Je ne trouve pas ce salon vocal. Donne son nom exact.";
    }
    destinationChannel = partialChannels[0];
    if (target.voice.channelId === destinationChannel.id) return "Cette personne est déjà dans ce salon vocal.";
  }

  let durationMs = 10 * 60 * 1000;
  if (timeoutMatch?.[2]) {
    const value = Number(timeoutMatch[2]);
    const unit = String(timeoutMatch[3] || "minutes").toLowerCase();
    const multiplier = /^(s|sec|seconde)/.test(unit) ? 1000 : /^(h|heure)/.test(unit) ? 3600000 : 60000;
    durationMs = Math.min(28 * 24 * 60 * 60 * 1000, Math.max(1000, value * multiplier));
  }
  pendingVoiceActions.set(pendingKey, {
    requesterId: userId,
    targetId: target.id,
    action,
    permission,
    botPermission: permission,
    destinationChannelId: destinationChannel?.id || null,
    durationMs,
    expiresAt: Date.now() + 20000,
  });
  const actionDescription = action === "kick"
    ? "expulser " + (target.displayName || target.user.username) + " du serveur"
    : action === "disconnect"
      ? "déconnecter " + (target.displayName || target.user.username) + " de son salon vocal"
      : action === "move"
        ? "déplacer " + (target.displayName || target.user.username) + " dans " + destinationChannel.name
        : "mettre " + (target.displayName || target.user.username) + " en pause pendant " + Math.round(durationMs / 60000) + " minutes";
  return "Je vais " + actionDescription + ". Dis « ChatIA, confirme » dans les 20 secondes pour confirmer, ou « ChatIA, annule » pour annuler.";
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

    const voiceChannel = client.channels.cache.get(session.voiceChannelId);
    const serverContext = await buildSafeGuildContext(guild, member, session?.textChannelId ? guild.channels.cache.get(session.textChannelId) : null, transcript, voiceChannel);
    const userMessage = `${username} sagt im Sprachchat: ${transcript}`;
    const messages = [
      { role: "system", content: buildSystemPrompt(serverContext) },
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
      void sendDialogueLog(session, `**${username}:** ${transcript}\n**Bot:** ${reply}`);
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

async function generateTextChatReply(guild, channel, author, text, session = null) {
  const memory = session?.memory || getOrCreateChannelMemory(guild.id, "text-" + channel.id);
  const member = await guild.members.fetch(author.id).catch(() => null);
  const username = member?.displayName || author.globalName || author.username || "Utilisateur";
  const serverContext = await buildSafeGuildContext(guild, member, channel);
  const userMessage = username + " écrit dans le salon texte : " + normalizeTranscriptText(text);
  const messages = [
    { role: "system", content: buildSystemPrompt(serverContext) },
    ...memory.history,
    { role: "user", content: userMessage },
  ];
  const generated = await generateChatCompletionText(messages);
  const reply = normalizeTranscriptText(generated);
  if (!reply) throw new Error("Le modèle n’a renvoyé aucune réponse.");
  const displayedReply = reply.length > 1900 ? reply.slice(0, 1897).trimEnd() + "..." : reply;
  appendConversationHistory(
    memory,
    { role: "user", content: trimForMemory(userMessage) },
    { role: "assistant", content: trimForMemory(reply) },
  );
  if (session) {
    memory.lastReplyAt = Date.now();
    memory.lastReplyByUser.set(author.id, Date.now());
    void sendDialogueLog(session, "**" + username + " (texte) :** " + text + "\n**Bot :** " + reply);
  }
  const voiceSession = session && member?.voice?.channelId === session.voiceChannelId ? session : null;
  return { reply: displayedReply, ttsText: clipForTts(reply), session: voiceSession };
}

async function handleTextChatCommand({ guild, channel, author, text, respond }) {
  const cleanText = normalizeTranscriptText(text);
  if (!cleanText) {
    await respond("Écris un message après la commande, par exemple /chat Salut ChatIA.");
    return;
  }
  const session = sessions.get(guild.id) || null;
  try {
    const commandSession = session || { guildId: guild.id };
    const moderationReply = await handleVoiceServerCommand(commandSession, author.id, cleanText);
    if (moderationReply) {
      await respond(moderationReply);
      if (session) {
        void enqueueSessionWork(session, async () => {
          await speakReply(session, moderationReply);
        });
      }
      return;
    }
    const result = await generateTextChatReply(guild, channel, author, cleanText, session);
    await respond(result.reply);
    if (result.session) {
      void enqueueSessionWork(result.session, async () => {
        await speakReply(result.session, result.ttsText);
      });
    }
  } catch (error) {
    log("Text chat error", error);
    await respond("Je n’ai pas réussi à générer une réponse. Réessaie dans un instant.");
  }
}
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName("join").setDescription("Rejoindre ton salon vocal et écouter").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("leave").setDescription("Quitter le salon vocal").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("say").setDescription("Faire prononcer un texte au bot").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(option => option.setName("texte").setDescription("Texte à prononcer").setRequired(true).setMaxLength(1500)),
    new SlashCommandBuilder().setName("chat").setDescription("Envoyer un message à ChatIA par écrit").addStringOption(option => option.setName("message").setDescription("Ton message pour ChatIA").setRequired(true).setMaxLength(1500)),
    new SlashCommandBuilder().setName("logs").setDescription("Configurer les journaux de dialogue")
      .addSubcommand(sub => sub.setName("on").setDescription("Activer l’affichage des dialogues"))
      .addSubcommand(sub => sub.setName("off").setDescription("Désactiver l’affichage des dialogues"))
      .addSubcommand(sub => sub.setName("salon").setDescription("Choisir le salon de journalisation").addChannelOption(option => option.setName("salon").setDescription("Salon texte où envoyer les dialogues").setRequired(true).addChannelTypes(ChannelType.GuildText)))
      .addSubcommand(sub => sub.setName("reset").setDescription("Revenir au salon texte par défaut")),
    new SlashCommandBuilder().setName("autoreconnect").setDescription("Configurer la reconnexion vocale automatique").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(sub => sub.setName("on").setDescription("Activer la reconnexion automatique"))
      .addSubcommand(sub => sub.setName("off").setDescription("Désactiver la reconnexion automatique")),
    new SlashCommandBuilder().setName("help").setDescription("Afficher l’aide du bot")
  ].map(command => command.toJSON());
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  log("Commandes slash enregistrées.");
}

async function handleSlashCommand(interaction) {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "Cette commande doit être utilisée dans un serveur.", ephemeral: true });
    return;
  }
  const command = interaction.commandName;
  if (["join", "leave", "say", "autoreconnect"].includes(command)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Il faut la permission **Gérer le serveur** pour utiliser cette commande.", ephemeral: true });
      return;
    }
  }
  const reply = async content => {
    const payload = typeof content === "string" ? { content } : content;
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  };
  try {
    if (command === "join") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await joinForMessage({ guild: interaction.guild, member, channel: interaction.channel, reply });
      return;
    }
    if (command === "leave") {
      if (isAutoJoinEnabled(interaction.guild.id)) setAutoJoinCooldown(interaction.guild.id, AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS);
      await destroySession(interaction.guild.id);
      await reply(isAutoJoinEnabled(interaction.guild.id)
        ? `Salon vocal quitté. Reconnexion automatique suspendue pendant ${Math.round(AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS / 1000)} s.`
        : "Salon vocal quitté.");
      return;
    }
    if (command === "chat") {
      await interaction.deferReply();
      await handleTextChatCommand({
        guild: interaction.guild,
        channel: interaction.channel,
        author: interaction.user,
        text: interaction.options.getString("message", true),
        respond: async content => {
          if (interaction.deferred || interaction.replied) return interaction.editReply(content);
          return interaction.reply(content);
        },
      });
      return;
    }
    if (command === "say") {
      const session = sessions.get(interaction.guild.id);
      if (!session) {
        await reply("Je ne suis dans aucun salon vocal. Utilise d’abord /join.");
        return;
      }
      const clipped = clipForTts(interaction.options.getString("texte", true));
      await interaction.deferReply();
      await enqueueSessionWork(session, async () => { await speakReply(session, clipped); });
      await reply(`Je prononce : "${clipped}"`);
      return;
    }
    if (command === "logs" || command === "autoreconnect") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await reply({ content: "Il faut la permission **Gérer le serveur** pour modifier ce réglage.", ephemeral: true });
        return;
      }
      const action = interaction.options.getSubcommand();
      if (command === "logs") {
        const settings = getDialogueLogSettings(interaction.guild.id);
        if (action === "on") { settings.enabled = true; await reply("Affichage des dialogues réactivé."); }
        else if (action === "off") { settings.enabled = false; await reply("Affichage des dialogues désactivé."); }
        else if (action === "salon") {
          const channel = interaction.options.getChannel("salon", true);
          if (!channel.isTextBased()) { await reply({ content: "Choisis un salon texte.", ephemeral: true }); return; }
          settings.channelId = channel.id;
          await reply("Les dialogues seront envoyés dans " + channel.toString() + ".");
        } else if (action === "reset") {
          settings.channelId = null;
          await reply("Le salon des dialogues revient au salon texte par défaut.");
        }
      } else {
        if (action === "on") { autoJoinOverrides.set(interaction.guild.id, true); await reply("Reconnexion automatique activée."); }
        else { autoJoinOverrides.set(interaction.guild.id, false); await reply("Reconnexion automatique désactivée."); }
      }
      return;
    }
    if (command === "help") {
      await reply({ content: [
        "**Commandes slash de ChatIA**",
        "/join - Rejoindre ton salon vocal",
        "/leave - Quitter le salon vocal",
        "/say texte - Faire prononcer un texte",
        "/chat message - Discuter par écrit (la réponse est aussi prononcée si je suis en vocal)",
        "/logs on, /logs off, /logs salon, /logs reset - Configurer les journaux (permission Gérer le serveur)",
        "/autoreconnect on ou /autoreconnect off - Configurer la reconnexion automatique (permission Gérer le serveur)",
        "/help - Afficher cette aide"
      ].join("\n"), ephemeral: true });
    }
  } catch (error) {
    log("Slash command error", error);
    await reply({ content: "Une erreur est survenue pendant l’exécution de la commande.", ephemeral: true }).catch(() => {});
  }
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await handleSlashCommand(interaction);
});

client.once("ready", async () => {
  await ensureRecordingsDir();
  try { await registerSlashCommands(); } catch (error) { log("Échec de l’enregistrement des commandes slash", error); }
  log(`Bot online als ${client.user.tag}`);
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
