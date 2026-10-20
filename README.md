# Discord Voice AI

Discord Voice AI is a self-hosted Discord bot that joins a voice channel, transcribes speech, generates an LLM response, and speaks the answer back into the call. The project is built for practical experimentation with real-time voice agents on commodity hardware and free-tier friendly APIs.

## What It Does

- captures Discord voice input per speaker
- transcribes speech through a Groq-compatible speech-to-text path
- generates replies through Groq or Google Vertex AI
- synthesizes audio through Google TTS or ElevenLabs
- keeps short per-channel memory and applies reply filters

## Core Features

- voice-in / voice-out interaction loop
- configurable wake words and cooldowns
- duplicate and echo protection
- courtesy filtering for low-value replies
- per-channel conversational context
- free-tier first setup with optional premium voice output

## Provider Matrix

| Layer | Default | Optional |
| --- | --- | --- |
| Speech to text | Gemini audio input when `LLM_PROVIDER=gemini` | Groq Whisper-compatible API |
| LLM replies | Gemini AI Studio when `LLM_PROVIDER=gemini` | Groq or Google Vertex AI |
| Text to speech | Google TTS | ElevenLabs |

## Quick Start

```bash
git clone https://github.com/agentzz1/discord-voice-ai.git
cd discord-voice-ai
npm install
cp .env.example .env
npm start
```

For the Gemini AI Studio setup, configure these environment variables in your hosting dashboard:

```bash
DISCORD_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_gemini_api_key
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-3.8-flash
GEMINI_TRANSCRIBE_MODEL=gemini-3.8-flash
BOT_LANGUAGE=fr
TTS_PROVIDER=google
```

Gemini is used for both audio transcription and response generation in this mode. Free-tier availability and quotas depend on Google AI Studio. Then use `!join` in a Discord text channel while you are already connected to a voice channel.

## Runtime Flow

1. Capture voice packets from Discord.
2. Convert and segment audio into a transcription-friendly format.
3. Filter out echoes, duplicates, and low-signal utterances.
4. Generate the reply through the configured LLM provider.
5. Render speech and play it back into the voice channel.

## Useful Commands

- `npm start` - run the bot
- `node --check src/index.js` - syntax check the entrypoint

## Project Focus

This repository is a hands-on voice-agent system rather than a generic bot template. It is intended for experimentation with practical speech pipelines, low-cost AI integrations, and real-time interaction design.

## License

MIT
