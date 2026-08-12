"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteCallRecordingAction,
  queueCallTranscriptAction,
} from "@/lib/actions/phone-system";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  AppIconButton,
  AppIconLink,
} from "@/components/ui/action-icon/AppActionIcon";

type ActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const initialState: ActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

function useActionToast(state: ActionState) {
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message || state.savedAt === null) return;
    showToast(state.message, state.ok ? "success" : "error");
  }, [showToast, state]);
}

export default function CallRecordingActions({
  callLogId,
  className = "mt-3",
  density = "default",
  hasTranscript = false,
  onReadTranscript,
  playbackUrl,
  recordingSid,
  transcriptStatus,
}: {
  callLogId: string;
  className?: string;
  density?: "default" | "compact";
  hasTranscript?: boolean;
  onReadTranscript?: () => void;
  playbackUrl: string | null;
  recordingSid: string | null;
  transcriptStatus?: string | null;
}) {
  const [transcriptState, transcriptAction, isQueuing] = useActionState(
    queueCallTranscriptAction,
    initialState,
  );
  const [deleteState, deleteAction, isDeleting] = useActionState(
    deleteCallRecordingAction,
    initialState,
  );

  useActionToast(transcriptState);
  useActionToast(deleteState);

  const iconSize = density === "compact" ? "xs" : "sm";
  const wrapClass =
    density === "compact" ? "flex-nowrap items-center gap-1.5" : "flex-wrap items-center gap-2";
  const normalizedTranscriptStatus = (transcriptStatus ?? "")
    .toUpperCase()
    .replaceAll("_", " ");
  const isTranscriptPending =
    normalizedTranscriptStatus === "QUEUED" ||
    normalizedTranscriptStatus === "REQUESTED" ||
    normalizedTranscriptStatus === "PROCESSING";
  const canQueueTranscript = Boolean(playbackUrl) && !hasTranscript && !isTranscriptPending;
  const transcriptLabel = hasTranscript
    ? "Read transcript"
    : !playbackUrl
      ? "Transcript unavailable"
      : isTranscriptPending
        ? "Transcript queued"
        : isQueuing
          ? "Queuing transcript"
          : "Queue transcript";

  return (
    <div className={`flex ${wrapClass} ${className}`}>
      {playbackUrl && (
        <CompactRecordingPlayer src={playbackUrl} />
      )}
      {hasTranscript ? (
        <AppIconButton
          type="button"
          onClick={onReadTranscript}
          disabled={!onReadTranscript}
          icon="transcript"
          label={transcriptLabel}
          size={iconSize}
          variant="success"
        />
      ) : (
        <form action={transcriptAction}>
          <input type="hidden" name="callLogId" value={callLogId} />
          <AppIconButton
            type="submit"
            disabled={!canQueueTranscript || isQueuing}
            icon="transcript"
            label={transcriptLabel}
            size={iconSize}
          />
        </form>
      )}
      {playbackUrl && (
        <AppIconLink
          href={playbackUrl}
          download
          icon="download"
          label="Download recording"
          size={iconSize}
        />
      )}
      {recordingSid && (
        <form action={deleteAction}>
          <input type="hidden" name="callLogId" value={callLogId} />
          <AppIconButton
            type="submit"
            disabled={isDeleting}
            icon="delete"
            label={isDeleting ? "Deleting recording" : "Delete recording"}
            size={iconSize}
            variant="danger"
          />
        </form>
      )}
    </div>
  );
}

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function CompactRecordingPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(nextValue: string) {
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = Number(nextValue);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="inline-flex h-7 w-[150px] shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-1.5 text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={togglePlayback}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-50 text-brand-600 transition hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300"
        aria-label={isPlaying ? "Pause recording" : "Play recording"}
      >
        {isPlaying ? (
          <span className="h-2.5 w-2.5 border-x-2 border-current" />
        ) : (
          <span className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-current" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step="0.1"
        value={Math.min(currentTime, duration || currentTime)}
        onChange={(event) => seek(event.target.value)}
        className="h-1 min-w-0 flex-1 accent-brand-500"
        aria-label="Recording position"
      />
      <span className="w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
        {formatPlayerTime(currentTime)}
      </span>
    </div>
  );
}
