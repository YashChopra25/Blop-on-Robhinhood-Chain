import { configureStore } from "@reduxjs/toolkit";
import { setAutoFreeze } from "immer";
import willReducer from "./willSlice";
import rolesReducer from "./rolesSlice";

/**
 * The store holds contract reads as viem decodes them: `bigint` for every
 * uint256 and `0x…` strings for addresses.
 *
 * This is markedly simpler than the Solana version, which had to keep `BN` and
 * `PublicKey` CLASS INSTANCES in state — and therefore had to disable Immer's
 * auto-freeze to stop a frozen `BN` from breaking libraries that mutate its
 * internal word array in place.
 *
 * `bigint` is a primitive, so none of that applies. Auto-freeze stays off only
 * because Redux Toolkit's serializability check still flags `bigint` (JSON
 * cannot represent it), and freezing large read results is wasted work on every
 * dispatch. Nothing here is persisted or time-travelled.
 */
setAutoFreeze(false);

export const store = configureStore({
  reducer: {
    will: willReducer,
    roles: rolesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // `bigint` is not JSON-serialisable and the viem `PublicClient` rides in
      // each thunk's argument; neither is a problem for this store's use.
      serializableCheck: false,
      immutableCheck: false,
    }),
});

export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
