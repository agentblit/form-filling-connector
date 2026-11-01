import { EventEmitter } from "events";

export type FormDataUpdateEvent = {
  formId: string;
  sessionId: string;
  data: Record<string, unknown>;
  updatedAt: string;
  changedKeys: string[];
};

type FormDataEvents = {
  update: [FormDataUpdateEvent];
};

declare global {
  // eslint-disable-next-line no-var
  var __formFillingEmitter: EventEmitter | undefined;
}

function getEmitter(): EventEmitter {
  if (!globalThis.__formFillingEmitter) {
    globalThis.__formFillingEmitter = new EventEmitter();
    globalThis.__formFillingEmitter.setMaxListeners(100);
  }
  return globalThis.__formFillingEmitter;
}

export function publishFormDataUpdate(event: FormDataUpdateEvent): void {
  getEmitter().emit("update", event);
}

export function subscribeFormDataUpdates(
  listener: (event: FormDataUpdateEvent) => void,
): () => void {
  const emitter = getEmitter();
  emitter.on("update", listener);
  return () => {
    emitter.off("update", listener);
  };
}

export type { FormDataEvents };
