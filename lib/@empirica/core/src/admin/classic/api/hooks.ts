import { useEffect, useState } from "react";
// import {get, writable, readable, derived, Writable, Readable} from 'svelte/store';

export type Setter<T> = (v: T) => void;
export type UpdateFn<T> = (v: T) => T;
export type Update<T> = (u: UpdateFn<T>) => void;

export function get<T>(store: Readable<T>): T | undefined {
  let value;

  store.subscribe((_) => (value = _))();

  return value;
}

const unset: any = Symbol();

export function useReadable<T>(store: Readable<T>): T | undefined {
  const [value, set] = useState<T>(unset as unknown as T);

  useEffect(() => store.subscribe(set), [store]);

  return value === unset ? get(store) : value;
}

export function useWritable<T>(
  store: Writable<T>
): [T | undefined, Setter<T>, Update<T>] {
  const value = useReadable(store);
  return [value, store.set, store.update.bind(void 0)];
}

// Re-export svelte's implementations of the stores.
// export { get, writable, readable, derived, Writable, Readable }
/** Readable interface for subscribing. */
export interface Readable<T> {
  /**
   * Subscribe on value changes.
   * @param run subscription callback
   * @param invalidate cleanup callback
   */
  subscribe(
    this: void,
    run: Subscriber<T>,
    invalidate?: Invalidator<T>
  ): Unsubscriber;
}

/** Writable interface for both updating and subscribing. */
export interface Writable<T> extends Readable<T> {
  /**
   * Set value and inform subscribers.
   * @param value to set
   */
  set(this: void, value: T): void;

  /**
   * Update value using callback and inform subscribers.
   * @param updater callback
   */
  update(this: void, updater: Updater<T>): void;
}

/** Callback to inform of a value updates. */
export type Subscriber<T> = (value: T) => void;

/** Unsubscribes from value updates. */
export type Unsubscriber = () => void;

/** Callback to update a value. */
export type Updater<T> = (value: T) => T;

/**
 * Start and stop notification callbacks.
 * This function is called when the first subscriber subscribes.
 *
 * @param {(value: T) => void} set Function that sets the value of the store.
 * @param {(value: Updater<T>) => void} update Function that sets the value of the store after passing the current value to the update function.
 * @returns {void | (() => void)} Optionally, a cleanup function that is called when the last remaining
 * subscriber unsubscribes.
 */
export type StartStopNotifier<T> = (
  set: (value: T) => void,
  update: (fn: Updater<T>) => void
) => void | (() => void);

/** Cleanup logic callback. */
export type Invalidator<T> = (value?: T) => void;

/** Pair of subscriber and invalidator. */
export type SubscribeInvalidateTuple<T> = [Subscriber<T>, Invalidator<T>];

/** One or more `Readable`s. */
export type Stores =
  | Readable<any>
  | [Readable<any>, ...Array<Readable<any>>]
  | Array<Readable<any>>;

/** One or more values from `Readable` stores. */
export type StoresValues<T> = T extends Readable<infer U>
  ? U
  : { [K in keyof T]: T[K] extends Readable<infer U> ? U : never };
