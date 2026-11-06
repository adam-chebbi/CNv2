import React, { useEffect, useState } from 'react';
import { Loading } from '../pos/ui';
import { AccountPage } from './AccountPage';
import { clientApi, type Me } from './clientApi';
import { ReservePage } from './ReservePage';
import { TablePage } from './TablePage';
import { CustomerDisplayPage, ReadyBoardPage } from './DisplayPages';

// Customer pages, served by the same application under public paths (no staff login):
//   /t/<code-table>  menu, ordering and services from the table's QR code
//   /compte          optional customer account
//   /reserver        online booking request

export const ClientApp: React.FC = () => {
  const path = window.location.pathname;
  // Customer-facing screens (amélioration 07): full screen, no account.
  if (path.startsWith('/commandes-pretes')) return <ReadyBoardPage />;
  const displayRegister = /^\/ecran-client\/([^/]+)/.exec(path)?.[1];
  if (displayRegister) return <CustomerDisplayPage registerId={decodeURIComponent(displayRegister)} />;
  return <ClientPages path={path} />;
};

const ClientPages: React.FC<{ path: string }> = ({ path }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void clientApi.me().then(setMe).catch(() => setMe(null)).finally(() => setReady(true));
  }, []);
  const tableToken = /^\/t\/([^/]+)/.exec(path)?.[1];
  return (
    <div className="min-h-screen bg-[#faf7f2] text-gray-900">
      <main className="max-w-2xl mx-auto p-4">
        {!ready ? (
          <Loading />
        ) : tableToken ? (
          <TablePage token={decodeURIComponent(tableToken)} me={me} />
        ) : path.startsWith('/reserver') ? (
          <ReservePage me={me} />
        ) : (
          <>
            <p className="font-serif text-2xl font-bold mb-4">Café Noir</p>
            <AccountPage me={me} onChange={setMe} />
          </>
        )}
      </main>
    </div>
  );
};
