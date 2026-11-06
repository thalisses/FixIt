import { ArrowLeftIcon } from "./icons";

interface BackButtonProps {
  label: string;
  onClick(): void;
}

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <button className="back-action" onClick={onClick} type="button">
      <ArrowLeftIcon />
      {label}
    </button>
  );
}
