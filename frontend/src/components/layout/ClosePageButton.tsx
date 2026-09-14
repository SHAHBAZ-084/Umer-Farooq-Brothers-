import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

type ClosePageButtonProps = {
  className?: string;
};

export function ClosePageButton({ className = '' }: ClosePageButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      className={`app-close-page-btn ${className}`.trim()}
      aria-label="Close and return to Dashboard"
    >
      <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>Close</span>
    </button>
  );
}
