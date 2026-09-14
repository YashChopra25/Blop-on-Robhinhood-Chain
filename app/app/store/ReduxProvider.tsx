"use client";

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { store } from "./index";

/**
 * Makes the store available to every client component.
 *
 * The store is a module singleton rather than one created per mount: this app
 * renders the dashboard entirely on the client, so there is no per-request
 * server render that could leak one user's state into another's.
 */
export function ReduxProvider({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
