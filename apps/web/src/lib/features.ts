export function areAttachmentsEnabled(): boolean {
  const setting = import.meta.env.VITE_ATTACHMENTS_ENABLED;
  if (setting === "true") {
    return true;
  }
  if (setting === "false") {
    return false;
  }
  return !import.meta.env.PROD;
}
