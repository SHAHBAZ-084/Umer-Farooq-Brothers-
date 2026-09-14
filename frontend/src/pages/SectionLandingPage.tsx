import { Navigate } from 'react-router-dom';
import { defaultCardDescription, QuickLinkCard } from '../components/ui/QuickLinkCard';
import { PageShell } from '../components/ui/PageShell';
import { getSectionById, getSectionCardGroups } from '../config/navigation';

type SectionLandingPageProps = {
  sectionId: string;
};

export function SectionLandingPage({ sectionId }: SectionLandingPageProps) {
  const section = getSectionById(sectionId);
  if (!section) {
    return <Navigate to="/" replace />;
  }

  const groups = getSectionCardGroups(sectionId);

  return (
    <PageShell subtitle={`Choose an option below`}>
      {groups.map(({ group, cards }) => (
        <div key={group ?? 'all'}>
          {group ? <h2 className="legacy-section-title">{group}</h2> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <QuickLinkCard
                key={card.to}
                to={card.to}
                title={card.label}
                description={card.description ?? defaultCardDescription(card.to)}
              />
            ))}
          </div>
        </div>
      ))}
    </PageShell>
  );
}
