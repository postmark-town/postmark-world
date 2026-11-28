// viewer-identity.mjs — THE HOST'S SPEAKER IDENTITY, PER VIEWER (WLD-249; CORE-178).
//
// The verbatim shell (spectator/index.html) mounts the World page with one argument, `mountViewer(app)`, so a host that wants its own whole speaker
// identity (circle-reader.mjs's `identityForSpeaker`, WLD-248) cannot hand it in as a mount option. This is the one supported entry instead:
//
//   import { mountViewer, setViewerIdentityForSpeaker } from "/world-engine/spectator/viewer.mjs";
//   setViewerIdentityForSpeaker(app, (handle) => freshIdentityNode(handle));   // before the mount, or after it: the same result
//   mountViewer(app);
//   setViewerIdentityForSpeaker(app, sameFunction);                             // again with the same function: its data changed, relabel now
//   setViewerIdentityForSpeaker(app, null);                                     // back to the World page's own face + name
//
// The provider is held PER APP ELEMENT (a WeakMap: two viewers never share one, and a dropped element takes its provider with it). The mounted viewer
// reads it through one stable function, at every draw, so a provider that arrives or changes later is what the next label uses; and every call to the
// setter tells that viewer to relabel what is already open (the conversation column's speakers row, its reader's bylines, its plain fallback lines),
// in place: no remount, no read of the office or the world, the camera, conversation, scroll, focus and open threads as they were. Nothing is polled.
// World only routes and invalidates: the node, its look, how a human and a resident differ, and any profile it shows are the host's (the #439 contract).

const PROVIDERS = new WeakMap();   // app element -> the host's identityForSpeaker
const LISTENERS = new WeakMap();   // app element -> the mounted viewer's relabel

const appOk = (appEl) => appEl !== null && (typeof appEl === "object" || typeof appEl === "function");

/**
 * Supply, replace or clear the host's whole speaker identity for the World viewer on `appEl`.
 * @param {Element} appEl   the element the viewer is (or will be) mounted on, as passed to mountViewer
 * @param {((handle: string) => (Element|null))|null} provider   a FRESH Element per call (circle-reader.mjs § identityForSpeaker), or null for the default.
 *   Anything that is not a function is null. Each call, even with the same function, relabels an already-mounted viewer's open labels.
 */
export function setViewerIdentityForSpeaker(appEl, provider) {
  if (!appOk(appEl)) throw new Error("setViewerIdentityForSpeaker needs the viewer's host element");
  if (typeof provider === "function") PROVIDERS.set(appEl, provider); else PROVIDERS.delete(appEl);
  const relabel = LISTENERS.get(appEl);
  if (relabel) relabel();
}

/** The mounted viewer's one stable identityForSpeaker for `appEl`: whatever provider is set NOW, or null (the default face + name). A throw is the lower layer's to refuse.
 *  WLD-256: a second argument (circle-reader.mjs § LINK_FREE, for an ancestor breadcrumb) is passed through when the reader sends one, and only then. */
export function viewerIdentityFor(appEl) {
  return (handle, ...context) => {
    const provider = PROVIDERS.get(appEl);
    return typeof provider === "function" ? provider(handle, ...context) : null;
  };
}

/** The mounted viewer's subscription: `relabel` runs on every setter call for `appEl`. Returns the unsubscribe (the viewer's stop). */
export function onViewerIdentity(appEl, relabel) {
  if (!appOk(appEl) || typeof relabel !== "function") return () => {};
  LISTENERS.set(appEl, relabel);
  return () => { if (LISTENERS.get(appEl) === relabel) LISTENERS.delete(appEl); };
}
