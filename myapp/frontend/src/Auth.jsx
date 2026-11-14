import { useState } from 'react';
import { api } from './api.js';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');       // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      onAuth(await (isLogin ? api.login : api.register)(username.trim(), password));
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot reach the server' : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth" onSubmit={submit}>
        <h1>Architecture Planner</h1>
        <p>{isLogin ? 'Sign in to open your diagrams.' : 'Create an account to save and export your diagrams.'}</p>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={isLogin ? undefined : 8} required />
          {!isLogin && <small>At least 8 characters</small>}
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{isLogin ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}>
          {isLogin ? 'No account yet? Create one' : 'Already registered? Sign in'}
        </button>
      </form>
    </div>
  );
}
