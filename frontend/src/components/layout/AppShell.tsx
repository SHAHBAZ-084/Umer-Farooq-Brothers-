import { Outlet, useLocation } from 'react-router-dom';
import { ContentHeader } from './ContentHeader';
import { MinimizedFormsTray } from './MinimizedFormsTray';
import { ReminderInAppToasts } from './ReminderInAppToasts';
import { TopBar } from './TopBar';

export function AppShell() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-main">
        <ContentHeader />
        <main className="app-main-scroll">
          {/* Key forces a full page remount so report/list UI cannot stick after Close → /. */}
          <Outlet key={location.pathname + location.search} />
        </main>
        <MinimizedFormsTray />
      </div>
      <ReminderInAppToasts />
    </div>
  );
}
