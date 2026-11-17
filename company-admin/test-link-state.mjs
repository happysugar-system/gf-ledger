// Pure test-only state machine. No network access or production data.
export function createState() { return { companyId: null, history: [] }; }
export function transition(state, action, companyId = null) {
  if (!state || !Array.isArray(state.history)) throw Error("Invalid state");
  if (action === "link" || action === "switch") {
    if (typeof companyId !== "string" || !/^TEST-[A-Z0-9-]+$/.test(companyId)) throw Error("Test company only");
    if (action === "link" && state.companyId !== null) throw Error("Already linked");
    if (action === "switch" && state.companyId === null) throw Error("Not linked");
    return {companyId, history: [...state.history, {action, companyId}]};
  }
  if (action === "unlink") {
    if (state.companyId === null) throw Error("Not linked");
    return {companyId: null, history: [...state.history, {action, companyId: state.companyId}]};
  }
  throw Error("Unknown action");
}
export function canView(state, companyId) { return state.companyId !== null && state.companyId === companyId; }
