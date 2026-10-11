import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { DEFAULT_AMBIENCE_URI, DEFAULT_LISTENING_SETTINGS, loadListeningSettings, type ListeningSettings } from "@/lib/listening-settings";
import { configureNotifications, MEDIA_ACTION_NEXT, MEDIA_ACTION_PREVIOUS, MEDIA_ACTION_STOP, MEDIA_ACTION_TOGGLE, MEDIA_NOTIFICATION_CATEGORY, MEDIA_NOTIFICATION_CHANNEL } from "@/lib/reminders";
import { loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";

const PLAYER_SESSION_KEY = "sukur-gunlugu.player-session.v1";
type SavedPlayerSession = { entryIds: string[]; currentIndex: number; sourceLabel: string; wasPlaying?: boolean; ambienceUri?: string | null; voiceIdentifier?: string; speechRate?: number };

type PlayerContextValue = {
  entries: GratitudeEntry[];
  queueRevision: number;
  currentIndex: number;
  isPlaying: boolean;
  isVisible: boolean;
  sourceLabel: string;
  settings: ListeningSettings;
  playEntries: (entries: GratitudeEntry[], startIndex?: number, ambienceUri?: string | null, sourceLabel?: string, voiceIdentifier?: string, speechRate?: number) => void;
  playIndex: (index: number) => void;
  toggle: () => void;
  pauseForRecording: () => void;
  next: () => void;
  previous: () => void;
  moveQueueEntry: (from: number, to: number) => void;
  removeQueueEntry: (index: number) => void;
  addQueueEntry: (entry: GratitudeEntry) => void;
  updateQueueEntry: (entry: GratitudeEntry) => void;
  toggleFavorite: (entryId?: string) => Promise<void>;
  stop: () => void;
  hide: () => void;
  setSettings: (settings: ListeningSettings) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [queueRevision, setQueueRevision] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("Şükürlerin");
  const [settings, setSettingsState] = useState(DEFAULT_LISTENING_SETTINGS);
  const entriesRef = useRef(entries);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const sourceLabelRef = useRef("Şükürlerin");
  const settingsRef = useRef(settings);
  const ambienceRef = useRef<AudioPlayer | null>(null);
  const attachmentAudioRef = useRef<AudioPlayer | null>(null);
  const attachmentAudioSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const attachmentLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambienceUriRef = useRef<string | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAdvanceAtRef = useRef(0);
  const completeGapRef = useRef<(() => void) | null>(null);
  const playbackTokenRef = useRef(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyFadeRef = useRef<() => void>(() => undefined);
  const ambienceStatusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const activeAmbienceRef = useRef<string | null | undefined>(undefined);
  const mediaNotificationIdRef = useRef<string | null>(null);
  const notificationPromiseRef = useRef<Promise<void> | null>(null);
  const notificationGenerationRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const shouldPersistSessionRef = useRef(false);
  const availableVoiceIdsRef = useRef<Set<string> | null>(null);
  const activeVoiceIdentifierRef = useRef<string | undefined>(undefined);
  const activeSpeechRateRef = useRef<number | undefined>(undefined);

  const setPlaying = useCallback((value: boolean) => {
    isPlayingRef.current = value;
    setIsPlaying(value);
  }, []);

  const persistSession = useCallback(async () => {
    if (!sessionReadyRef.current || !shouldPersistSessionRef.current || !entriesRef.current.length) return;
    const session: SavedPlayerSession = {
      entryIds: entriesRef.current.map((entry) => entry.id),
      currentIndex: currentIndexRef.current,
      sourceLabel: sourceLabelRef.current,
      wasPlaying: isPlayingRef.current,
      ...(activeAmbienceRef.current !== undefined ? { ambienceUri: activeAmbienceRef.current } : {}),
      ...(activeVoiceIdentifierRef.current ? { voiceIdentifier: activeVoiceIdentifierRef.current } : {}),
      ...(activeSpeechRateRef.current !== undefined ? { speechRate: activeSpeechRateRef.current } : {}),
    };
    try { await AsyncStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(session)); } catch { /* Resume is a convenience; playback should continue if storage fails. */ }
  }, []);

  const clearSavedSession = useCallback(() => {
    shouldPersistSessionRef.current = false;
    void AsyncStorage.removeItem(PLAYER_SESSION_KEY).catch(() => undefined);
  }, []);

  const clearPendingAdvance = useCallback(() => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    gapTimerRef.current = null;
    pendingAdvanceAtRef.current = 0;
    completeGapRef.current = null;
  }, []);

  const stopAttachmentAudio = useCallback(() => {
    if (attachmentLoadTimeoutRef.current) clearTimeout(attachmentLoadTimeoutRef.current);
    attachmentLoadTimeoutRef.current = null;
    attachmentAudioSubscriptionRef.current?.remove();
    attachmentAudioSubscriptionRef.current = null;
    const player = attachmentAudioRef.current;
    attachmentAudioRef.current = null;
    if (player) {
      try { player.pause(); } catch { /* Native player may already be released. */ }
      try { player.remove(); } catch { /* Native player may already be released. */ }
    }
  }, []);

  useEffect(() => { entriesRef.current = entries; }, [entries]);
  useEffect(() => { void persistSession(); }, [currentIndex, entries, isPlaying, persistSession, sourceLabel]);

  const fadeAmbience = useCallback((target: number) => {
    const player = ambienceRef.current;
    if (!player) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    let from = target;
    try { from = player.volume; } catch { return; }
    const start = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / 200);
      try { player.volume = from + (target - from) * progress; } catch { return; }
      if (progress < 1) fadeTimerRef.current = setTimeout(tick, 16);
      else {
        fadeTimerRef.current = null;
        applyFadeRef.current = () => undefined;
      }
    };
    applyFadeRef.current = tick;
    tick();
  }, []);

  const stopAmbience = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = null;
    applyFadeRef.current = () => undefined;
    if (!ambienceRef.current) return;
    try { ambienceRef.current.pause(); } catch { /* Native player may already be released. */ }
    try { ambienceRef.current.seekTo(0); } catch { /* Native player may already be released. */ }
    try { ambienceRef.current.volume = 0; } catch { /* Native player may already be released. */ }
    try { ambienceRef.current.clearLockScreenControls(); } catch { /* Lock-screen controls are optional. */ }
  }, []);

  const updatePlaybackNotification = useCallback(async () => {
    if (Platform.OS === "web" || mediaNotificationIdRef.current) return;
    if (notificationPromiseRef.current) {
      await notificationPromiseRef.current;
      if (!mediaNotificationIdRef.current && isPlayingRef.current) return updatePlaybackNotification();
      return;
    }
    const generation = notificationGenerationRef.current;
    const task = (async () => {
      try {
        await configureNotifications();
        if (generation !== notificationGenerationRef.current || !isPlayingRef.current || mediaNotificationIdRef.current) return;
        const [presented, scheduled] = await Promise.all([
          Notifications.getPresentedNotificationsAsync().catch(() => []),
          Notifications.getAllScheduledNotificationsAsync().catch(() => []),
        ]);
        const oldPresented = presented.filter((item) => item.request.content.data?.kind === "gratitude-media");
        const oldScheduled = scheduled.filter((item) => item.content.data?.kind === "gratitude-media");
        await Promise.all([
          ...oldPresented.map((item) => Notifications.dismissNotificationAsync(item.request.identifier).catch(() => undefined)),
          ...oldScheduled.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined)),
        ]);
        if (generation !== notificationGenerationRef.current || !isPlayingRef.current) return;
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Dinleme sürüyor",
            body: "Şükranların oynatılıyor.",
            sound: false,
            data: { kind: "gratitude-media" },
            categoryIdentifier: MEDIA_NOTIFICATION_CATEGORY,
            ...(Platform.OS === "android" ? { channelId: MEDIA_NOTIFICATION_CHANNEL, sticky: true, autoDismiss: false } : {}),
          },
          trigger: null,
        });
        if (generation !== notificationGenerationRef.current || !isPlayingRef.current) {
          await Notifications.dismissNotificationAsync(id).catch(() => undefined);
          return;
        }
        mediaNotificationIdRef.current = id;
      } catch {
        // Playback remains available even if Android notifications are unavailable.
      }
    })();
    notificationPromiseRef.current = task;
    try { await task; }
    finally { if (notificationPromiseRef.current === task) notificationPromiseRef.current = null; }
  }, []);

  const clearPlaybackNotification = useCallback(() => {
    notificationGenerationRef.current += 1;
    if (!mediaNotificationIdRef.current) return;
    const id = mediaNotificationIdRef.current;
    mediaNotificationIdRef.current = null;
    Notifications.dismissNotificationAsync(id).catch(() => undefined);
  }, []);

  const ensureAmbience = useCallback(() => {
    const uri = activeAmbienceRef.current === undefined ? settingsRef.current.ambienceUri : activeAmbienceRef.current;
    const backgroundKeepAlive = settingsRef.current.backgroundPlayback;
    if (!uri && !backgroundKeepAlive) return null;
    if (ambienceUriRef.current !== uri) {
      ambienceStatusSubscriptionRef.current?.remove();
      ambienceStatusSubscriptionRef.current = null;
      try { ambienceRef.current?.clearLockScreenControls(); } catch { /* Lock-screen control is optional. */ }
      try { ambienceRef.current?.pause(); } catch { /* Native player may already be released. */ }
      try { ambienceRef.current?.remove(); } catch { /* Native player may already be released. */ }
      ambienceRef.current = null;
      ambienceUriRef.current = uri;
    }
    if (!ambienceRef.current) {
      const source = uri === DEFAULT_AMBIENCE_URI || !uri
        ? require("@/assets/audio/gentle-stream-loop.mp3")
        : uri;
      try {
        ambienceRef.current = createAudioPlayer(source, { updateInterval: 200 });
        ambienceRef.current.loop = true;
        ambienceRef.current.volume = uri ? 1 : 0;
        ambienceStatusSubscriptionRef.current = ambienceRef.current.addListener("playbackStatusUpdate", (status) => {
          if (status.playbackState === "error") {
            const failedPlayer = ambienceRef.current;
            ambienceRef.current = null;
            ambienceStatusSubscriptionRef.current?.remove();
            ambienceStatusSubscriptionRef.current = null;
            try { failedPlayer?.remove(); } catch { /* Native player already failed. */ }
            activeAmbienceRef.current = null;
            return;
          }
          applyFadeRef.current();
          if (pendingAdvanceAtRef.current && Date.now() >= pendingAdvanceAtRef.current) completeGapRef.current?.();
        });
      } catch {
        ambienceRef.current = null;
        ambienceUriRef.current = null;
        activeAmbienceRef.current = null;
        return null;
      }
    }
    if (backgroundKeepAlive) {
      try {
        ambienceRef.current.setActiveForLockScreen(true, {
          title: "Dinleme sürüyor",
          artist: "Şükran Günlüğü",
          albumTitle: "Şükranların oynatılıyor",
        }, { showSeekBackward: false, showSeekForward: false });
      } catch { /* Lock-screen controls are optional; preserve speech playback. */ }
    }
    return ambienceRef.current;
  }, []);

  const speakAt = useCallback((index: number) => {
    const token = playbackTokenRef.current;
    const item = entriesRef.current[index];
    stopAttachmentAudio();
    if (!item) {
      setPlaying(false);
      stopAmbience();
      clearPlaybackNotification();
      return;
    }
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setPlaying(true);
    setIsVisible(true);
    void updatePlaybackNotification().catch(() => undefined);
    const ambience = ensureAmbience();
    if (ambience) {
      try { ambience.play(); } catch { activeAmbienceRef.current = null; }
      const selectedAmbience = activeAmbienceRef.current === undefined ? settingsRef.current.ambienceUri : activeAmbienceRef.current;
      fadeAmbience(selectedAmbience ? settingsRef.current.ambienceVolume / 100 : 0);
    } else {
      stopAmbience();
    }

    let finished = false;
    let speechFallbackStarted = false;
    const finishCurrent = () => {
      if (finished || token !== playbackTokenRef.current) return;
      finished = true;
      const effectiveAmbience = activeAmbienceRef.current === undefined ? settingsRef.current.ambienceUri : activeAmbienceRef.current;
      fadeAmbience(effectiveAmbience ? 1 : 0);
      const gapMs = Math.max(0, settingsRef.current.gapSeconds * 1000);
      pendingAdvanceAtRef.current = Date.now() + gapMs;
      const advance = () => {
        if (token !== playbackTokenRef.current) return;
        const remaining = pendingAdvanceAtRef.current - Date.now();
        if (remaining > 0) {
          gapTimerRef.current = setTimeout(() => completeGapRef.current?.(), remaining);
          return;
        }
        if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
        gapTimerRef.current = null;
        pendingAdvanceAtRef.current = 0;
        completeGapRef.current = null;
        const activeIndex = currentIndexRef.current;
        if (activeIndex + 1 < entriesRef.current.length) {
          speakAt(activeIndex + 1);
        } else {
          setPlaying(false);
          currentIndexRef.current = 0;
          setCurrentIndex(0);
          stopAmbience();
          clearPlaybackNotification();
          clearSavedSession();
        }
      };
      completeGapRef.current = advance;
      if (gapMs <= 0) advance();
      else gapTimerRef.current = setTimeout(() => completeGapRef.current?.(), gapMs);
    };

    const speakWithDeviceVoice = () => {
      if (speechFallbackStarted || token !== playbackTokenRef.current) return;
      speechFallbackStarted = true;
      const selectedVoice = activeVoiceIdentifierRef.current ?? settingsRef.current.voiceIdentifier;
      const voiceIds = availableVoiceIdsRef.current;
      const validVoice = selectedVoice && (!voiceIds || voiceIds.has(selectedVoice)) ? selectedVoice : undefined;
      Speech.speak(item.text, {
        language: "tr-TR",
        ...(validVoice ? { voice: validVoice } : {}),
        rate: activeSpeechRateRef.current ?? settingsRef.current.rate,
        pitch: 1,
        onDone: finishCurrent,
        onStopped: () => { /* Intentional transitions update state in the initiating action. */ },
        onError: () => {
          if (token === playbackTokenRef.current) {
            setPlaying(false);
            stopAmbience();
            clearPlaybackNotification();
            clearSavedSession();
          }
        },
      });
    };

    if (item.audioUri) {
      try {
        const player = createAudioPlayer(item.audioUri, { updateInterval: 250 });
        attachmentAudioRef.current = player;
        attachmentAudioSubscriptionRef.current = player.addListener("playbackStatusUpdate", (status) => {
          if (token !== playbackTokenRef.current || player !== attachmentAudioRef.current) return;
          if (status.isLoaded && attachmentLoadTimeoutRef.current) {
            clearTimeout(attachmentLoadTimeoutRef.current);
            attachmentLoadTimeoutRef.current = null;
          }
          if (status.didJustFinish) {
            stopAttachmentAudio();
            finishCurrent();
          } else if (status.playbackState === "error") {
            stopAttachmentAudio();
            speakWithDeviceVoice();
          }
        });
        attachmentLoadTimeoutRef.current = setTimeout(() => {
          if (player === attachmentAudioRef.current && !player.isLoaded) {
            stopAttachmentAudio();
            speakWithDeviceVoice();
          }
        }, 12000);
        player.play();
      } catch {
        stopAttachmentAudio();
        speakWithDeviceVoice();
      }
      return;
    }
    speakWithDeviceVoice();
  }, [clearPlaybackNotification, clearSavedSession, ensureAmbience, fadeAmbience, setPlaying, stopAmbience, stopAttachmentAudio, updatePlaybackNotification]);

  const startAt = useCallback((index: number) => {
    if (index < 0 || index >= entriesRef.current.length) return;
    clearPendingAdvance();
    stopAttachmentAudio();
    const token = ++playbackTokenRef.current;
    shouldPersistSessionRef.current = true;
    void (async () => {
      await Speech.stop().catch(() => undefined);
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: settingsRef.current.backgroundPlayback, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix" }).catch(() => undefined);
      if (token !== playbackTokenRef.current) return;
      speakAt(index);
    })();
  }, [clearPendingAdvance, speakAt, stopAttachmentAudio]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [loadedSettings, voices] = await Promise.all([
          loadListeningSettings(),
          Speech.getAvailableVoicesAsync().catch(() => []),
        ]);
        if (!active) return;
        settingsRef.current = loadedSettings;
        setSettingsState(loadedSettings);
        availableVoiceIdsRef.current = new Set(voices.map((voice) => voice.identifier));
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: loadedSettings.backgroundPlayback, interruptionMode: "doNotMix" }).catch(() => undefined);
        const raw = await AsyncStorage.getItem(PLAYER_SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SavedPlayerSession>;
          if (Array.isArray(saved.entryIds)) {
            const storedEntries = await loadGratitudeEntries();
            const byId = new Map(storedEntries.map((entry) => [entry.id, entry]));
            const restoredEntries = saved.entryIds.map((id) => byId.get(id)).filter((entry): entry is GratitudeEntry => Boolean(entry));
            if (active && restoredEntries.length) {
              const restoredIndex = Math.max(0, Math.min(restoredEntries.length - 1, Number(saved.currentIndex) || 0));
              const restoredSource = typeof saved.sourceLabel === "string" && saved.sourceLabel.trim() ? saved.sourceLabel : "Şükürlerin";
              entriesRef.current = restoredEntries;
              currentIndexRef.current = restoredIndex;
              sourceLabelRef.current = restoredSource;
              setEntries(restoredEntries);
              setQueueRevision((revision) => revision + 1);
              setCurrentIndex(restoredIndex);
              setSourceLabel(restoredSource);
              activeAmbienceRef.current = saved.ambienceUri === null || typeof saved.ambienceUri === "string" ? saved.ambienceUri : undefined;
              activeVoiceIdentifierRef.current = typeof saved.voiceIdentifier === "string" ? saved.voiceIdentifier : undefined;
              activeSpeechRateRef.current = typeof saved.speechRate === "number" ? Math.min(2, Math.max(0.5, saved.speechRate)) : undefined;
              shouldPersistSessionRef.current = true;
              setIsVisible(true);
              sessionReadyRef.current = true;
              // Restored sessions remain paused after an app restart; playback resumes only after an explicit user action.
              setPlaying(false);
            } else if (!restoredEntries.length) {
              await AsyncStorage.removeItem(PLAYER_SESSION_KEY);
            }
          }
        }
      } catch {
        await AsyncStorage.removeItem(PLAYER_SESSION_KEY).catch(() => undefined);
      } finally {
        if (active) sessionReadyRef.current = true;
      }
    })();
    return () => { active = false; };
  }, [setPlaying, speakAt]);

  const playEntries = useCallback((nextEntries: GratitudeEntry[], startIndex = 0, ambienceUri?: string | null, nextSourceLabel = "Şükürlerin", voiceIdentifier?: string, speechRate?: number) => {
    clearPendingAdvance();
    stopAmbience();
    const safeAmbienceUri = ambienceUri && (ambienceUri === DEFAULT_AMBIENCE_URI || ambienceUri.startsWith("file://")) ? ambienceUri : null;
    activeAmbienceRef.current = safeAmbienceUri;
    activeVoiceIdentifierRef.current = voiceIdentifier;
    activeSpeechRateRef.current = typeof speechRate === "number" ? Math.min(2, Math.max(0.5, speechRate)) : undefined;
    const queue = nextEntries.filter((entry) => typeof entry.text === "string" && entry.text.trim().length > 0);
    entriesRef.current = queue;
    currentIndexRef.current = Math.max(0, Math.min(startIndex, queue.length - 1));
    sourceLabelRef.current = nextSourceLabel;
    shouldPersistSessionRef.current = queue.length > 0;
    setEntries(queue);
    setQueueRevision((revision) => revision + 1);
    setCurrentIndex(currentIndexRef.current);
    setSourceLabel(nextSourceLabel);
    setIsVisible(queue.length > 0);
    if (queue.length) startAt(currentIndexRef.current);
    else { setPlaying(false); clearSavedSession(); }
  }, [clearPendingAdvance, clearSavedSession, setPlaying, startAt, stopAmbience]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      const activeEntry = entriesRef.current[currentIndexRef.current];
      const attachmentPlayer = activeEntry?.audioUri ? attachmentAudioRef.current : null;
      if (attachmentPlayer) { try { attachmentPlayer.pause(); } catch { /* Native player may already be released. */ } }
      else {
        playbackTokenRef.current += 1;
        void Speech.stop();
      }
      clearPendingAdvance();
      setPlaying(false);
      stopAmbience();
      clearPlaybackNotification();
      void persistSession();
    } else if (entriesRef.current.length) {
      shouldPersistSessionRef.current = true;
      const activeEntry = entriesRef.current[currentIndexRef.current];
      const attachmentPlayer = activeEntry?.audioUri ? attachmentAudioRef.current : null;
      if (attachmentPlayer) {
        void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: settingsRef.current.backgroundPlayback, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix" }).catch(() => undefined);
        const ambience = ensureAmbience();
        if (ambience) {
          try { ambience.play(); } catch { activeAmbienceRef.current = null; }
          const selectedAmbience = activeAmbienceRef.current === undefined ? settingsRef.current.ambienceUri : activeAmbienceRef.current;
          fadeAmbience(selectedAmbience ? settingsRef.current.ambienceVolume / 100 : 0);
        }
        setPlaying(true);
        setIsVisible(true);
        try { attachmentPlayer.play(); } catch { startAt(currentIndexRef.current); return; }
        void updatePlaybackNotification().catch(() => undefined);
      } else startAt(currentIndexRef.current);
    }
  }, [clearPendingAdvance, clearPlaybackNotification, ensureAmbience, fadeAmbience, persistSession, setPlaying, startAt, stopAmbience, updatePlaybackNotification]);

  const pauseForRecording = useCallback(() => {
    if (!isPlayingRef.current) return;
    const activeEntry = entriesRef.current[currentIndexRef.current];
    const attachmentPlayer = activeEntry?.audioUri ? attachmentAudioRef.current : null;
    if (attachmentPlayer) { try { attachmentPlayer.pause(); } catch { /* Native player may already be released. */ } }
    else {
      playbackTokenRef.current += 1;
      void Speech.stop();
    }
    clearPendingAdvance();
    setPlaying(false);
    clearPlaybackNotification();
    // Keep the ambient player alive while the microphone records the user's own voice.
    try { ambienceRef.current?.play(); } catch { /* Ambient playback is optional during recording. */ }
    void persistSession();
  }, [clearPendingAdvance, clearPlaybackNotification, persistSession, setPlaying]);

  const playIndex = useCallback((index: number) => {
    if (index < 0 || index >= entriesRef.current.length) return;
    startAt(index);
  }, [startAt]);

  const stop = useCallback(() => {
    void Speech.stop();
    playbackTokenRef.current += 1;
    clearPendingAdvance();
    stopAttachmentAudio();
    setPlaying(false);
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    stopAmbience();
    clearPlaybackNotification();
    clearSavedSession();
  }, [clearPendingAdvance, clearPlaybackNotification, clearSavedSession, setPlaying, stopAmbience, stopAttachmentAudio]);

  const hide = useCallback(() => { stop(); setIsVisible(false); }, [stop]);

  const next = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= entriesRef.current.length) return;
    startAt(nextIndex);
  }, [startAt]);

  const previous = useCallback(() => {
    const previousIndex = currentIndexRef.current - 1;
    if (previousIndex < 0) return;
    startAt(previousIndex);
  }, [startAt]);

  const moveQueueEntry = useCallback((from: number, to: number) => {
    const currentQueue = entriesRef.current;
    if (from < 0 || from >= currentQueue.length || to < 0 || to >= currentQueue.length || from === to) return;
    const currentId = currentQueue[currentIndexRef.current]?.id;
    const nextQueue = [...currentQueue];
    const [moved] = nextQueue.splice(from, 1);
    nextQueue.splice(to, 0, moved);
    entriesRef.current = nextQueue;
    setEntries(nextQueue);
    const nextCurrentIndex = Math.max(0, nextQueue.findIndex((entry) => entry.id === currentId));
    currentIndexRef.current = nextCurrentIndex;
    setCurrentIndex(nextCurrentIndex);
    void persistSession();
  }, [persistSession]);

  const removeQueueEntry = useCallback((index: number) => {
    const currentQueue = entriesRef.current;
    if (index < 0 || index >= currentQueue.length) return;
    const wasCurrent = index === currentIndexRef.current;
    const wasPlaying = isPlayingRef.current;
    const currentId = currentQueue[currentIndexRef.current]?.id;
    const nextQueue = currentQueue.filter((_, itemIndex) => itemIndex !== index);
    if (!nextQueue.length) {
      stop();
      entriesRef.current = [];
      setEntries([]);
      setIsVisible(false);
      return;
    }
    entriesRef.current = nextQueue;
    setEntries(nextQueue);
    const nextCurrentIndex = wasCurrent
      ? Math.min(index, nextQueue.length - 1)
      : Math.max(0, nextQueue.findIndex((entry) => entry.id === currentId));
    currentIndexRef.current = nextCurrentIndex;
    setCurrentIndex(nextCurrentIndex);
    if (wasCurrent && !wasPlaying) {
      playbackTokenRef.current += 1;
      clearPendingAdvance();
      stopAttachmentAudio();
      void Speech.stop();
    }
    if (wasCurrent && wasPlaying) {
      startAt(nextCurrentIndex);
    } else {
      void persistSession();
    }
  }, [clearPendingAdvance, persistSession, startAt, stop, stopAttachmentAudio]);

  const addQueueEntry = useCallback((entry: GratitudeEntry) => {
    if (entriesRef.current.some((item) => item.id === entry.id)) return;
    const nextQueue = [...entriesRef.current, entry];
    entriesRef.current = nextQueue;
    setEntries(nextQueue);
    shouldPersistSessionRef.current = true;
    void persistSession();
  }, [persistSession]);

  const updateQueueEntry = useCallback((updatedEntry: GratitudeEntry) => {
    const index = entriesRef.current.findIndex((entry) => entry.id === updatedEntry.id);
    if (index < 0) return;
    const queue = [...entriesRef.current];
    const previousEntry = queue[index];
    if (index === currentIndexRef.current && previousEntry.audioUri !== updatedEntry.audioUri) {
      playbackTokenRef.current += 1;
      clearPendingAdvance();
      stopAttachmentAudio();
      void Speech.stop();
      if (isPlayingRef.current) {
        setPlaying(false);
        stopAmbience();
        clearPlaybackNotification();
      }
    }
    queue[index] = updatedEntry;
    entriesRef.current = queue;
    setEntries(queue);
    void persistSession();
  }, [clearPendingAdvance, clearPlaybackNotification, persistSession, setPlaying, stopAmbience, stopAttachmentAudio]);

  const toggleFavorite = useCallback(async (entryId?: string) => {
    const targetId = entryId ?? entriesRef.current[currentIndexRef.current]?.id;
    if (!targetId) return;
    const stored = await loadGratitudeEntries();
    const target = stored.find((entry) => entry.id === targetId);
    if (!target) return;
    const favorite = !target.favorite;
    const updated = stored.map((entry) => entry.id === targetId ? { ...entry, favorite } : entry);
    await saveGratitudeEntries(updated);
    const queue = entriesRef.current.map((entry) => entry.id === targetId ? { ...entry, favorite } : entry);
    entriesRef.current = queue;
    setEntries(queue);
  }, []);

  const setSettings = useCallback((nextSettings: ListeningSettings) => {
    settingsRef.current = nextSettings;
    setSettingsState(nextSettings);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: settings.backgroundPlayback, interruptionMode: "doNotMix", interruptionModeAndroid: "doNotMix" }).catch(() => undefined);
  }, [settings.backgroundPlayback]);

  useEffect(() => {
    const effectiveAmbience = activeAmbienceRef.current === undefined ? settings.ambienceUri : activeAmbienceRef.current;
    if (ambienceUriRef.current !== effectiveAmbience) {
      ambienceStatusSubscriptionRef.current?.remove();
      ambienceStatusSubscriptionRef.current = null;
      try { ambienceRef.current?.clearLockScreenControls(); } catch { /* Lock-screen control is optional. */ }
      try { ambienceRef.current?.pause(); } catch { /* Native player may already be released. */ }
      try { ambienceRef.current?.remove(); } catch { /* Native player may already be released. */ }
      ambienceRef.current = null;
      ambienceUriRef.current = effectiveAmbience;
    }
    if (ambienceRef.current) {
      try { ambienceRef.current.volume = ambienceUriRef.current ? settings.ambienceVolume / 100 : 0; } catch { /* Native player may have failed. */ }
      if (!settings.backgroundPlayback) {
        try { ambienceRef.current.clearLockScreenControls(); } catch { /* Lock-screen control is optional. */ }
      }
    }
  }, [settings.ambienceUri, settings.ambienceVolume, settings.backgroundPlayback]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        if (!settingsRef.current.backgroundPlayback) {
          void Speech.stop();
          playbackTokenRef.current += 1;
          clearPendingAdvance();
          stopAttachmentAudio();
          setPlaying(false);
          stopAmbience();
          clearPlaybackNotification();
          clearSavedSession();
        } else {
          void persistSession();
        }
      } else if (state === "active") {
        if (pendingAdvanceAtRef.current && Date.now() >= pendingAdvanceAtRef.current) {
          completeGapRef.current?.();
        } else if (isPlayingRef.current) {
          const activeEntry = entriesRef.current[currentIndexRef.current];
          if (activeEntry?.audioUri && attachmentAudioRef.current?.paused) {
            try { attachmentAudioRef.current.play(); } catch { startAt(currentIndexRef.current); }
          } else if (activeEntry) {
            void Speech.isSpeakingAsync().then((speaking) => {
              if (!speaking && isPlayingRef.current && !pendingAdvanceAtRef.current) startAt(currentIndexRef.current);
            }).catch(() => undefined);
          }
        }
      }
    });
    return () => {
      subscription.remove();
      void Speech.stop();
      stopAttachmentAudio();
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
      ambienceStatusSubscriptionRef.current?.remove();
      ambienceStatusSubscriptionRef.current = null;
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      try { ambienceRef.current?.clearLockScreenControls(); } catch { /* Lock-screen control is optional. */ }
      try { ambienceRef.current?.remove(); } catch { /* Native player may already be released. */ }
      if (mediaNotificationIdRef.current) Notifications.dismissNotificationAsync(mediaNotificationIdRef.current).catch(() => undefined);
    };
  }, [clearPendingAdvance, clearPlaybackNotification, clearSavedSession, persistSession, setPlaying, startAt, stopAmbience, stopAttachmentAudio]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.kind !== "gratitude-media") return;
      if (response.actionIdentifier === MEDIA_ACTION_PREVIOUS) previous();
      else if (response.actionIdentifier === MEDIA_ACTION_NEXT) next();
      else if (response.actionIdentifier === MEDIA_ACTION_TOGGLE) toggle();
      else if (response.actionIdentifier === MEDIA_ACTION_STOP) stop();
    });
    return () => subscription.remove();
  }, [next, previous, stop, toggle]);

  const value = useMemo(() => ({
    entries, queueRevision, currentIndex, isPlaying, isVisible, sourceLabel, settings,
    playEntries, playIndex, toggle, pauseForRecording, next, previous, moveQueueEntry, removeQueueEntry, addQueueEntry, updateQueueEntry, toggleFavorite, stop, hide, setSettings,
  }), [addQueueEntry, currentIndex, entries, hide, isPlaying, isVisible, moveQueueEntry, next, pauseForRecording, playEntries, playIndex, previous, queueRevision, removeQueueEntry, setSettings, settings, sourceLabel, stop, toggle, toggleFavorite, updateQueueEntry]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
