export const isStandaloneMode =
  import.meta.env.DEV && import.meta.env.VITE_STANDALONE_MODE === "true";

export function standaloneSuccess<T>(data: T): Promise<Service.RequestResult<T>> {
  return Promise.resolve({ error: null, data });
}

export function standaloneFailure<T = never>(message: string): Promise<Service.RequestResult<T>> {
  return Promise.resolve({
    error: {
      type: "backend",
      code: "STANDALONE_ERROR",
      msg: message,
    },
    data: null,
  });
}

export { standaloneEditorStore } from "./StandaloneEditorStore";
