import { useEffect } from "react";

// Um formulário com alterações avisa aqui. Quem navega pergunta antes de sair.
let hasUnsavedChanges = false;

const DISCARD_QUESTION =
  "Você tem alterações não salvas. Deseja sair sem salvar?";

export function markChangesSaved(): void {
  hasUnsavedChanges = false;
}

/** Devolve true quando pode sair: não há alterações ou a pessoa confirmou. */
export function confirmDiscardChanges(): boolean {
  if (!hasUnsavedChanges) {
    return true;
  }
  const confirmed = window.confirm(DISCARD_QUESTION);
  if (confirmed) {
    hasUnsavedChanges = false;
  }
  return confirmed;
}

/** Liga o aviso enquanto o formulário tiver alterações não salvas. */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    hasUnsavedChanges = isDirty;
    if (!isDirty) {
      return undefined;
    }

    // Cobre fechar a aba e recarregar a página.
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      hasUnsavedChanges = false;
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [isDirty]);
}
