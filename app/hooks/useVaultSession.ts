"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deriveRecipientKeypair,
  type RecipientKeypair,
} from "@/lib/crypto";

/**
 * Two wallet-derived capabilities the app needs, kept separate on purpose.
 *
 * **Session** authenticates the caller to our API: a signed challenge in
 * exchange for an HttpOnly cookie. It proves "this wallet is here right now".
 *
 * **Identity** is the X25519 keypair that unseals documents. It never leaves the
 * browser and the server never sees it. It proves "this wallet can decrypt".
 *
 * Neither is derived from the other, and a compromised session cannot yield the
 * identity — which is the property that makes the encryption meaningful.
 *
 * Both now use EIP-191 `personal_sign` (wagmi's `signMessageAsync`) instead of
 * the Solana wallet adapter's raw-bytes `signMessage`, and signatures travel as
 * `0x…` hex rather than base58.
 */

// ---- API session -------------------------------------------------------

const SESSION_KEY = ["authSession"] as const;

/** `fetch` for authenticated API routes; signs in and retries once on a 401. */
export type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

type SignMessage = (args: { message: string }) => Promise<string>;

async function fetchSession(): Promise<string | null> {
  const res = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.wallet ?? null;
}

/**
 * In-flight sign-ins, keyed by wallet.
 *
 * A dashboard mounts many authenticated queries at once (one metadata request
 * per document). Without this, an expired session would open one wallet prompt
 * per row; with it, every caller waits on the same single signature.
 */
const pendingSignIns = new Map<string, Promise<void>>();

function signInOnce(wallet: string, signMessage: SignMessage): Promise<void> {
  const key = wallet.toLowerCase();
  const pending = pendingSignIns.get(key);
  if (pending) return pending;

  const attempt = (async () => {
    const challengeRes = await fetch(
      `/api/auth/challenge?wallet=${encodeURIComponent(wallet)}`,
      { credentials: "same-origin" }
    );
    if (!challengeRes.ok) {
      const { error } = await challengeRes.json().catch(() => ({}));
      throw new Error(error ?? "Could not start sign-in");
    }
    const { message, token } = await challengeRes.json();

    const signature = await signMessage({ message });

    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, wallet, message, signature }),
    });
    if (!verifyRes.ok) {
      const { error } = await verifyRes.json().catch(() => ({}));
      throw new Error(error ?? "Sign-in failed");
    }
  })().finally(() => pendingSignIns.delete(key));

  pendingSignIns.set(key, attempt);
  return attempt;
}

export function useVaultSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const wallet = address ?? null;

  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 60_000,
  });

  /**
   * True when the cookie belongs to the wallet currently connected.
   *
   * Compared case-insensitively: EIP-55 gives every address two valid spellings
   * and the server stores the lowercase one, so a strict `===` against a
   * checksummed wallet address would report a valid session as signed-out.
   */
  const signedIn =
    !!wallet &&
    !!sessionQuery.data &&
    sessionQuery.data.toLowerCase() === wallet.toLowerCase();

  /** Prompt for a signature (shared across concurrent callers) and record the session. */
  const signInWallet = useCallback(async () => {
    if (!wallet) throw new Error("Connect a wallet first");
    await signInOnce(wallet, signMessageAsync);
    queryClient.setQueryData(SESSION_KEY, wallet.toLowerCase());
  }, [wallet, signMessageAsync, queryClient]);

  const signIn = useMutation({
    mutationFn: async () => {
      await signInWallet();
      return wallet;
    },
  });

  /**
   * Make sure the server holds a live session for the connected wallet.
   *
   * Asks the server rather than trusting the cached `signedIn`: the cookie can
   * expire while the cached answer is still fresh, which is how requests used
   * to fail with no signature prompt. Use before requests that cannot simply be
   * retried, like an upload with progress.
   */
  const ensureSignedIn = useCallback(async () => {
    if (!wallet) throw new Error("Connect a wallet first");
    const current = await fetchSession();
    queryClient.setQueryData(SESSION_KEY, current);
    if (current?.toLowerCase() === wallet.toLowerCase()) return;
    await signInWallet();
  }, [wallet, queryClient, signInWallet]);

  /**
   * `fetch` for authenticated routes.
   *
   * Signs in up front when the cached session is known to be missing or belongs
   * to another wallet (which the server would answer with a 403, not a 401).
   * Otherwise sends the request, and on a 401 — an expired or cleared cookie —
   * asks for a signature and retries once.
   */
  const authFetch = useCallback<AuthFetch>(
    async (input, init) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const send = () => fetch(input, { credentials: "same-origin", ...init });

      const cached = queryClient.getQueryData<string | null>(SESSION_KEY);
      if (cached !== undefined && cached?.toLowerCase() !== wallet.toLowerCase()) {
        await signInWallet();
        return send();
      }

      const res = await send();
      if (res.status !== 401) return res;
      queryClient.setQueryData(SESSION_KEY, null);
      await signInWallet();
      return send();
    },
    [wallet, queryClient, signInWallet]
  );

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
  }, [queryClient]);

  return {
    wallet,
    signedIn,
    checking: sessionQuery.isLoading,
    signIn: signIn.mutateAsync,
    signingIn: signIn.isPending,
    signInError: signIn.error instanceof Error ? signIn.error.message : null,
    ensureSignedIn,
    authFetch,
    signOut,
  };
}

// ---- document identity (X25519) ----------------------------------------

/**
 * In-memory cache of the derived identity, keyed by wallet.
 *
 * Deliberately NOT persisted: writing a decryption key to localStorage would
 * hand it to any script that ever runs on this origin, which is the failure
 * this whole design exists to avoid. The cost is one wallet signature per
 * page load, which is the right trade for an inheritance vault.
 */
const identityCache = new Map<string, RecipientKeypair>();

export function useVaultIdentity() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const wallet = address?.toLowerCase() ?? null;

  const cached = wallet ? identityCache.get(wallet) ?? null : null;

  const unlock = useCallback(async (): Promise<RecipientKeypair> => {
    if (!wallet) throw new Error("Connect a wallet first");
    const existing = identityCache.get(wallet);
    if (existing) return existing;

    // `verify: true` signs twice and checks the signatures match. ECDSA is only
    // deterministic because wallets implement RFC 6979; a wallet that did not
    // would derive a different key every session and silently orphan every
    // document sealed to the previous one. Ed25519 on Solana made this free.
    const identity = await deriveRecipientKeypair(
      (message) => signMessageAsync({ message }),
      { verify: !identityCache.size }
    );
    identityCache.set(wallet, identity);
    return identity;
  }, [wallet, signMessageAsync]);

  /** Forget the in-memory key — call on disconnect. */
  const lock = useCallback(() => {
    if (wallet) identityCache.delete(wallet);
  }, [wallet]);

  return useMemo(
    () => ({ wallet, identity: cached, unlocked: !!cached, unlock, lock }),
    [wallet, cached, unlock, lock]
  );
}
