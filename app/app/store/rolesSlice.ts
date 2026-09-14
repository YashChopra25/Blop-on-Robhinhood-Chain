import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { Address, PublicClient } from "viem";
import { EMPTY_ROLES, fetchMyRoles } from "@/lib/evm/rolesFetch";
import type { MyRoles } from "@/app/types/roles.types";

/** The wills the connected wallet is attached to, as custodian or as heir. */
export interface RolesState {
  data: MyRoles;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  /** The address `data` describes — used to ignore stale responses. */
  wallet: string | null;
}

const initialState: RolesState = {
  data: EMPTY_ROLES,
  status: "idle",
  error: null,
  wallet: null,
};

export const loadMyRoles = createAsyncThunk<
  { wallet: string; roles: MyRoles },
  { client: PublicClient; wallet: Address },
  { rejectValue: string }
>("roles/load", async ({ client, wallet }, { rejectWithValue }) => {
  try {
    return {
      wallet: wallet.toLowerCase(),
      roles: await fetchMyRoles(client, wallet),
    };
  } catch (e) {
    return rejectWithValue(
      e instanceof Error ? e.message : "Failed to load your wills"
    );
  }
});

const rolesSlice = createSlice({
  name: "roles",
  initialState,
  reducers: {
    clearRoles() {
      return { ...initialState };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMyRoles.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loadMyRoles.fulfilled, (state, action) => {
        state.status = "ready";
        state.wallet = action.payload.wallet;
        state.data = action.payload.roles;
        state.error = null;
      })
      .addCase(loadMyRoles.rejected, (state, action) => {
        state.status = "error";
        state.error =
          action.payload ?? action.error.message ?? "Failed to load your wills";
      });
  },
});

export const { clearRoles } = rolesSlice.actions;
export default rolesSlice.reducer;
