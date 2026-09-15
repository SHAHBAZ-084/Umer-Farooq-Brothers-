import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { APP_HOME_PATH } from '../../config/routes';

type ClosePageButtonProps = {
  className?: string;
};

export function ClosePageButton({ className = '' }: ClosePageButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        // Always return to the blank default home — clear search/hash so report
        // filter state cannot linger on the URL.
        navigate({ pathname: APP_HOME_PATH, search: '', hash: '' }, { replace: true });
      }}
      className={`app-close-page-btn ${className}`.trim()}
      aria-label="Close and return home"
    >
      <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>Close</span>
    </button>
  );
}
