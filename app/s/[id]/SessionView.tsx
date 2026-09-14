"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { BotTurn } from "@/components/BotTurn";
import { Legend } from "@/components/Legend";
import Recorder from "@/components/Recorder";
import { SessionHeader } from "@/components/SessionHeader";
import { TextInput } from "@/components/TextInput";
import { UserTurn } from "@/components/UserTurn";
import { analyze, hasPendingTurn, historyFromTurns, streamReply } from "@/lib/api";
import { errorText } from "@/lib/http";
import { newId } from "@/lib/ids";
import { loadSession, saveSession } from "@/lib/store";
import type {
  AnalyzeRequest,
  BotTurn as BotTurnData,
  ReplyRequest,
  Session,
  Turn,
  UserTurn as UserTurnData,
} from "@/lib/types";

type TurnInput = { audio?: { wavBase64: string }; text?: string; hint: string | null };
type OpenPopover = { turnId: string; index: number };

const SCROLL_STICK_PX = 80;
/** Streaming deltas arrive many times a second; the server is written at most this often. */
const PERSIST_DEBOUNCE_MS = 300;

function updateTurn(session: Session, id: string, patch: (turn: Turn) => Turn): Session {
  return { ...session, turns: session.turns.map((t) => (t.id === id ? patch(t) : t)) };
}

export function SessionView({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [interim, setInterim] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenPopover | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saves run one after another so an older snapshot can never overwrite a newer one. */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  /** The last snapshot handed to the server; the same object is never sent twice. */
  const lastQueuedRef = useRef<Session | null>(null);

  const runReply = useCallback(async (botId: string, req: ReplyRequest, signal: AbortSignal) => {
    try {
      await streamReply(
        req,
        (delta) => {
          setSession((prev) =>
            prev ? updateTurn(prev, botId, (t) => (t.role === "bot" ? { ...t, text: t.text + delta } : t)) : prev,
          );
        },
        signal,
      );
      setSession((prev) =>
        prev ? updateTurn(prev, botId, (t) => (t.role === "bot" ? { ...t, streaming: false } : t)) : prev,
      );
    } catch (err) {
      if (signal.aborted) return;
      const message = errorText(err);
      // Keep whatever text streamed before the failure; the error is shown under it.
      setSession((prev) =>
        prev ? updateTurn(prev, botId, (t) => (t.role === "bot" ? { ...t, error: message, streaming: false } : t)) : prev,
      );
    }
  }, []);

  const runAnalyze = useCallback(async (userId: string, req: AnalyzeRequest, signal: AbortSignal) => {
    try {
      const analysis = await analyze(req, signal);
      setSession((prev) =>
        prev ? updateTurn(prev, userId, (t) => (t.role === "user" ? { ...t, analysis, error: null } : t)) : prev,
      );
    } catch (err) {
      if (signal.aborted) return;
      const message = errorText(err);
      setSession((prev) =>
        prev ? updateTurn(prev, userId, (t) => (t.role === "user" ? { ...t, error: message } : t)) : prev,
      );
    }
  }, []);

  // Load the session from the server after hydration; a fresh session gets the bot opener.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    async function load() {
      let loaded: Session | null;
      try {
        loaded = await loadSession(id);
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err));
        return;
      }
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        return;
      }
      if (loaded.turns.length > 0) {
        // What came back is what the server holds; nothing to write until the learner acts.
        lastQueuedRef.current = loaded;
        startTransition(() => setSession(loaded));
        return;
      }
      const bot: BotTurnData = { role: "bot", id: newId(), text: "", streaming: true, error: null };
      const opened: Session = { ...loaded, turns: [bot] };
      startTransition(() => setSession(opened));
      void runReply(bot.id, { history: [], topic: loaded.topic, level: loaded.level }, controller.signal);
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, runReply]);

  // Derived, so it can never lag behind the turns it describes.
  const inFlight = session ? hasPendingTurn(session.turns) : false;

  // Persist with a trailing debounce; the server strips in-flight state so a reload never shows a stuck spinner.
  // A failed save is noted under the conversation and never blocks it; the next change retries.
  const persist = useCallback((snapshot: Session) => {
    if (lastQueuedRef.current === snapshot) return;
    lastQueuedRef.current = snapshot;
    saveChainRef.current = saveChainRef.current
      .then(() => saveSession(snapshot))
      .then(
        () => setSaveError(null),
        (err: unknown) => {
          console.warn("[session] save failed; the conversation continues unsaved.", err);
          setSaveError(errorText(err));
        },
      );
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (sessionRef.current) persist(sessionRef.current);
  }, [persist]);

  useEffect(() => {
    sessionRef.current = session;
    if (!session) return;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persist(session);
    }, PERSIST_DEBOUNCE_MS);
  }, [session, persist]);

  // A finished turn and an unmount must not wait for the debounce.
  useEffect(() => {
    if (!inFlight) flushSave();
  }, [inFlight, flushSave]);

  useEffect(() => flushSave, [flushSave]);

  // Follow the conversation unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [session?.turns, interim]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_STICK_PX;
  }

  function submitTurn(input: TurnInput) {
    if (!session || inFlight) return;
    const controller = abortRef.current;
    if (!controller) return;
    const history = historyFromTurns(session.turns);
    const user: UserTurnData = { role: "user", id: newId(), hint: input.hint, analysis: null, error: null };
    const bot: BotTurnData = { role: "bot", id: newId(), text: "", streaming: true, error: null };
    const learner = input.audio ? { audio: input.audio, hint: input.hint ?? undefined } : { text: input.text };

    stickRef.current = true;
    setInterim(null);
    setNotice(null);
    setOpen(null);
    setSession((prev) => (prev ? { ...prev, turns: [...prev.turns, user, bot] } : prev));

    void runAnalyze(user.id, { ...learner, level: session.level, lang: session.lang }, controller.signal);
    void runReply(bot.id, { ...learner, history, topic: session.topic, level: session.level }, controller.signal);
  }

  if (missing || loadError !== null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
        <h1 className="text-lg font-medium">{missing ? "Session not found" : "Could not load the session"}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {missing ? "It may have been deleted." : loadError}
        </p>
        <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
          Back to the start
        </Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-20 text-sm text-zinc-400 sm:px-6 dark:text-zinc-500">Loading…</main>
    );
  }

  const busy = inFlight || interim !== null;

  return (
    <div className="flex h-dvh flex-col">
      <SessionHeader topic={session.topic} level={session.level} />

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
          {session.turns.map((turn) =>
            turn.role === "bot" ? (
              <BotTurn key={turn.id} turn={turn} />
            ) : (
              <UserTurn
                key={turn.id}
                turn={turn}
                openIndex={open?.turnId === turn.id ? open.index : null}
                onOpenChange={(index) => setOpen(index === null ? null : { turnId: turn.id, index })}
              />
            ),
          )}
          {interim !== null && (
            <UserTurn
              turn={{ role: "user", id: "interim", hint: interim, analysis: null, error: null }}
              listening
              openIndex={null}
              onOpenChange={() => undefined}
            />
          )}
        </main>
      </div>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
          {notice && (
            <p role="alert" className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              {notice}
            </p>
          )}
          {saveError !== null && (
            <p role="status" className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
              Not saved: {saveError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Recorder
              disabled={inFlight}
              onInterim={(text) => {
                setNotice(null);
                setInterim(text);
              }}
              onResult={(r) => submitTurn({ audio: { wavBase64: r.wavBase64 }, hint: r.hint })}
              onError={(message) => {
                setInterim(null);
                setNotice(message);
              }}
            />
            <TextInput disabled={busy} onSend={(text) => submitTurn({ text, hint: text })} />
          </div>
          <Legend className="mt-3 lg:hidden" />
        </div>
      </footer>

      <div className="fixed bottom-6 left-6 hidden lg:block">
        <Legend vertical />
      </div>
    </div>
  );
}
