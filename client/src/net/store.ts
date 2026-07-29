// Client-side connection + state store. One WebSocket to the server; the server
// broadcasts full state, we cache it and notify React via useSyncExternalStore.
// We also track the server clock offset so derived times match the TV exactly.

import { useCallback, useSyncExternalStore } from 'react';
import type { AudioCue, ClientEnvelope, Command, DB, ServerMessage } from '@poker/shared';

type Listener = () => void;

let socket: WebSocket | null = null;
let db: DB | null = null;
let connected = false;
/** serverNow - clientNow at last message; add to Date.now() for a corrected clock. */
let clockOffsetMs = 0;

const stateListeners = new Set<Listener>();
const audioListeners = new Set<(cue: AudioCue) => void>();
const noticeListeners = new Set<(message: string) => void>();

function emit(): void {
  for (const l of stateListeners) l();
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  const ws = new WebSocket(wsUrl());
  socket = ws;

  ws.onopen = () => {
    connected = true;
    emit();
  };

  ws.onmessage = (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data as string) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === 'state') {
      db = msg.db;
      clockOffsetMs = msg.serverNow - Date.now();
      emit();
    } else if (msg.type === 'audio') {
      for (const l of audioListeners) l(msg.cue);
    } else if (msg.type === 'error') {
      console.warn('[server]', msg.message);
      for (const l of noticeListeners) l(msg.message);
    }
  };

  ws.onclose = () => {
    connected = false;
    socket = null;
    emit();
    // Reconnect: important for event reliability (laptop sleep, WiFi hiccup).
    setTimeout(connect, 1000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

export function sendCommand(command: Command): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const env: ClientEnvelope = { command };
    socket.send(JSON.stringify(env));
  } else {
    console.warn('[ws] not connected; command dropped:', command.type);
  }
}

/** Corrected "now" aligned to the server clock. */
export function correctedNow(): number {
  return Date.now() + clockOffsetMs;
}

export function onAudio(handler: (cue: AudioCue) => void): () => void {
  audioListeners.add(handler);
  return () => audioListeners.delete(handler);
}

export function onNotice(handler: (message: string) => void): () => void {
  noticeListeners.add(handler);
  return () => noticeListeners.delete(handler);
}

// ---- React bindings -------------------------------------------------------

function subscribe(listener: Listener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function useDB(): DB | null {
  return useSyncExternalStore(subscribe, () => db);
}

export function useConnected(): boolean {
  return useSyncExternalStore(subscribe, () => connected);
}

export function useSend(): (command: Command) => void {
  return useCallback(sendCommand, []);
}
