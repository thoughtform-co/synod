import { useState } from 'react';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  hasGoogleEnv,
  setStoredAccount,
} from './authStore';
import { connectGoogleAccount } from './googleOAuth';

interface ConnectGoogleAccountViewProps {
  onConnected: () => void;
}

export function ConnectGoogleAccountView({ onConnected }: ConnectGoogleAccountViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) {
      setError('Missing Google OAuth credentials. Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in .env');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { email } = await connectGoogleAccount(clientId, clientSecret);
      await setStoredAccount({ email });
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  if (!hasGoogleEnv()) {
    return (
      <div className="connect-view">
        <h1 className="connect-view__title">Synod</h1>
        <p className="connect-view__hint">
          Add <code>VITE_GOOGLE_CLIENT_ID</code> and <code>VITE_GOOGLE_CLIENT_SECRET</code> to{' '}
          <code>.env</code> to connect your Google account.
        </p>
      </div>
    );
  }

  return (
    <div className="connect-view">
      <h1 className="connect-view__title">Synod</h1>
      <p className="connect-view__subtitle">Connect your Google account to continue.</p>
      {error && <p className="connect-view__error">{error}</p>}
      <button
        type="button"
        className="connect-view__button"
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? 'Opening browser…' : 'Connect Google account'}
      </button>
    </div>
  );
}
