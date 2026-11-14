import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Auth from './Auth.jsx';
import Editor from './Editor.jsx';
import { api, hasToken, setToken, setAuthErrorHandler } from './api.js';

export default function Root() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!hasToken());

  useEffect(() => {
    setAuthErrorHandler(() => setUser(null));
    if (hasToken()) api.me().then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  const logout = () => { setToken(null); setUser(null); };

  if (!ready) return <div className="boot">Loading…</div>;
  if (!user) return <Auth onAuth={({ token, user: u }) => { setToken(token); setUser(u); }} />;
  return (
    <ReactFlowProvider>
      <Editor key={user.id} user={user} onLogout={logout} />
    </ReactFlowProvider>
  );
}
