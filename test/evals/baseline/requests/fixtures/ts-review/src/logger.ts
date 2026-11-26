export const logger = {
  info: (message: string): void => console.log(message),
  error: (message: string, error?: unknown): void => console.error(message, error),
};
