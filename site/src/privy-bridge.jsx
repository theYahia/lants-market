import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PrivyProvider,
  useConnectWallet,
  useWallets,
  useLogout,
} from '@privy-io/react-auth';

const bridge = {
  connectWallet: null,
  onProvider: null,
  lastAddress: null,
  currentWallet: null,
  logout: null,
};

function PrivyInner() {
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const { logout } = useLogout();
  const doneRef = useRef(null);

  useEffect(() => {
    bridge.connectWallet = connectWallet;
  }, [connectWallet]);

  useEffect(() => {
    bridge.logout = logout;
  }, [logout]);

  useEffect(() => {
    const wallet = wallets && wallets[0];
    if (!wallet) return;
    const address = wallet.address;
    if (!address) return;
    if (doneRef.current === address) return;
    doneRef.current = address;
    bridge.lastAddress = address;

    let cancelled = false;
    wallet
      .getEthereumProvider()
      .then((provider) => {
        if (cancelled) return;
        bridge.currentWallet = wallet;
        if (typeof bridge.onProvider === 'function') {
          bridge.onProvider(provider, address);
        }
      })
      .catch(() => {
        if (doneRef.current === address) {
          doneRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [wallets]);

  return null;
}

export function mountPrivy(appId, onProvider) {
  bridge.onProvider = onProvider;

  const container = document.createElement('div');
  container.style.display = 'none';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet'],
        embeddedWallets: { createOnLogin: 'off' },
        appearance: {
          theme: 'dark',
          accentColor: '#beff6c',
        },
      }}
    >
      <PrivyInner />
    </PrivyProvider>
  );

  return root;
}

export function openPrivy() {
  if (typeof bridge.connectWallet === 'function') {
    bridge.connectWallet();
  }
}

export function disconnectPrivy() {
  const wallet = bridge.currentWallet;
  if (wallet && typeof wallet.disconnect === 'function') {
    wallet.disconnect();
  } else if (typeof bridge.logout === 'function') {
    bridge.logout();
  }
}