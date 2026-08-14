export function createHistoryStore() {
  const histories = new Map();

  function ensure(documentId) {
    if (!histories.has(documentId)) histories.set(documentId, { undo: [], redo: [], pending: null });
    return histories.get(documentId);
  }

  return {
    ensure,
    begin(documentId, snapshot) {
      ensure(documentId).pending = snapshot;
    },
    commit(documentId, currentBody) {
      const history = ensure(documentId);
      const previous = history.pending;
      history.pending = null;
      if (previous && previous.body !== currentBody) {
        history.undo.push(previous);
        history.redo.length = 0;
      }
    },
    undo(documentId, currentSnapshot) {
      const history = ensure(documentId);
      const snapshot = history.undo.pop();
      if (!snapshot) return null;
      history.redo.push(currentSnapshot);
      return snapshot;
    },
    redo(documentId, currentSnapshot) {
      const history = ensure(documentId);
      const snapshot = history.redo.pop();
      if (!snapshot) return null;
      history.undo.push(currentSnapshot);
      return snapshot;
    }
  };
}
