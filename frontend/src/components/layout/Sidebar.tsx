import { Link, useLocation } from 'react-router-dom';
import { DatabaseBackup, LayoutDashboard, Users } from 'lucide-react';
import { SIDEBAR_NAV, getSectionLandingPath, sectionIsActive } from '../../config/navigation';
import { APP_BRAND_NAME } from '../../config/brand';

export function Sidebar() {
  const location = useLocation();
  const dashboardActive = location.pathname === '/';

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-brand">
        <Link to="/" className="app-sidebar-brand-link" aria-label={`${APP_BRAND_NAME} — Dashboard`}>
          <span className="app-sidebar-brand-title" role="img" aria-label={APP_BRAND_NAME}>
            {APP_BRAND_NAME}
          </span>
        </Link>
        <p className="app-sidebar-brand-sub">POS</p>
      </div>

      <nav className="app-sidebar-nav">
        <Link to="/" className={`app-sidebar-link app-sidebar-link-top ${dashboardActive ? 'is-active' : ''}`}>
          <LayoutDashboard className="app-sidebar-nav-icon shrink-0" strokeWidth={2} />
          <span>Dashboard</span>
        </Link>

        {SIDEBAR_NAV.map((section) => {
          const active = sectionIsActive(location.pathname, section);
          const Icon = section.icon;

          return (
            <Link
              key={section.id}
              to={getSectionLandingPath(section.id)}
              className={`app-sidebar-link app-sidebar-link-top ${active ? 'is-active' : ''}`}
            >
              <Icon className="app-sidebar-nav-icon shrink-0" strokeWidth={2} />
              <span>{section.label}</span>
            </Link>
          );
        })}

        <Link
          to="/backup"
          className={`app-sidebar-link app-sidebar-link-top ${location.pathname === '/backup' ? 'is-active' : ''}`}
        >
          <DatabaseBackup className="app-sidebar-nav-icon shrink-0" strokeWidth={2} />
          <span>Backup</span>
        </Link>
      </nav>

      <div className="app-sidebar-footer">
        <Link
          to="/user"
          className={`app-sidebar-link app-sidebar-link-top ${location.pathname === '/user' ? 'is-active' : ''}`}
        >
          <Users className="app-sidebar-nav-icon shrink-0" strokeWidth={2} />
          <span>User</span>
        </Link>
      </div>
    </aside>
  );
}
