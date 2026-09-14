"use client";

import { useCallback, useEffect } from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useAppDispatch, useAppSelector } from "@/app/store/hooks";
import { loadMyRoles } from "@/app/store/rolesSlice";
import type { MyRoles } from "@/app/types/roles.types";

interface UseMyRolesResult {
  data: MyRoles;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Auto-loads every will the connected wallet participates in, split by role:
 * the wills where it is a beneficiary and the wills where it is a custodian.
 * The result lives in the Redux store, so the intervene panel and the
 * inheritance list share one fetch.
 *
 * Backed by the contract's reverse-role indices rather than by a log scan, so it
 * keeps working against a plain RPC with no indexer — which matters for a
 * protocol an heir may only interact with years from now.
 */
export function useMyRoles(): UseMyRolesResult {
  const { address } = useAccount();
  const client = usePublicClient();
  const dispatch = useAppDispatch();
  const wallet = address ?? null;

  const { data, status, error } = useAppSelector((s) => s.roles);

  const refresh = useCallback(async () => {
    if (!wallet || !client) return;
    await dispatch(loadMyRoles({ client, wallet: wallet as Address }));
  }, [dispatch, client, wallet]);

  useEffect(() => {
    if (!wallet || !client) return;
    dispatch(loadMyRoles({ client, wallet: wallet as Address }));
  }, [dispatch, client, wallet]);

  return { data, loading: status === "loading", error, refresh };
}
