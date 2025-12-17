import { useEffect } from "react";

type EventHandler = (e: Event) => void;

class TestEvent<TData> extends Event {
	public data: TData;
	constructor(evtType: string, data: TData) {
		super(evtType);
		this.data = data;
	}
}

/**
 * This creates an event bus with concrete event types.
 * It returns the exposed emit function to send events, and a hook to consume them.
 *
 * The hook takes care of cleanup once the component unmounts.
 */
export const createEventHook = <T extends Record<string, any>>() => {
	type TEventName = keyof T;
	// Event bus is created once per created hook
	const bus = new EventTarget();

	const useEvent = <TSpecificEventName extends TEventName>(
		evtName: TSpecificEventName,
		fn: (data: T[TSpecificEventName]) => void,
	) => {
		useEffect(() => {
			// This function simplifies the API by calling the callback only with the event's data
			const wrappedFn = (evt: Event & { data: any }) => {
				fn(evt.data);
			};

			bus.addEventListener(evtName as string, wrappedFn as EventHandler);

			return () =>
				bus.removeEventListener(evtName as string, wrappedFn as EventHandler);
		}, [fn, evtName]);
	};

	const emitEvent = <TSpecificEventName extends TEventName>(
		evtName: TSpecificEventName,
		evtPayload: T[TSpecificEventName],
	) => bus.dispatchEvent(new TestEvent(evtName as string, evtPayload));

	return [emitEvent, useEvent] as const;
};
