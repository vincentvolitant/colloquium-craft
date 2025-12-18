import { PublicScheduleView } from '@/components/schedule/PublicScheduleView';
import { Helmet } from 'react-helmet-async';

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Kolloquiumsplaner - Prüfungstermine für Bachelor- und Masterarbeiten</title>
        <meta name="description" content="Übersicht aller Kolloquiumstermine für Bachelor- und Masterarbeiten. Finden Sie Termine, Räume und Prüfer auf einen Blick." />
      </Helmet>
      <PublicScheduleView />
    </>
  );
};

export default Index;
