/** Plans history within the caller's existing save transaction.
 * Each snapshot uses verified document URLs. The caller owns persistence and link rendering.
 */
function GF_OperationalHistoryPlan_(current, op) {
  const groups = [
    ['DriverID', '現在使用者', '📄 最新車両書類'],
    ['前DriverID', '前使用者', '前使用者 車両書類'],
    ['前々DriverID', '前々使用者', '前々使用者 車両書類'],
  ];
  const keys = groups.flat();
  if (typeof op?.id !== 'string' || !op.id.trim() || !/^V\d{6}$/.test(op.vehicleId)) {
    throw Error('invalid_operation');
  }
  const read = value => {
    const snapshot = {};
    for (const key of keys) {
      if (typeof value?.[key] !== 'string') throw Error('invalid_snapshot');
      snapshot[key] = value[key];
    }
    return snapshot;
  };
  const before = read(current);
  if (op.kind === 'cancel') {
    return GF_CombinedHistoryPlan_(before, op);
  }
  for (const [id, name, document] of groups) {
    const filled = Boolean(before[id] || before[name] || before[document]);
    if (filled && (!/^D\d{6}$/.test(before[id]) || !before[name].trim())) {
      throw Error('history_identity_unresolved');
    }
    if (before[document] && !/^https:\/\/(drive|docs)\.google\.com\/[^\s]+$/.test(before[document])) {
      throw Error('unverified_document');
    }
  }

  const after = {...before};
  if (op.kind === 'return') {
    if (!before.DriverID || before.DriverID !== op.driverId) throw Error('return_driver_mismatch');
    for (let generation = 2; generation > 0; generation--) {
      groups[generation].forEach((key, i) => { after[key] = before[groups[generation - 1][i]]; });
    }
    groups[0].forEach(key => { after[key] = ''; });
  } else if (op.kind === 'assignment' || op.kind === 'loan') {
    if (!/^D\d{6}$/.test(op.driverId) || typeof op.name !== 'string' || !op.name.trim()) {
      throw Error('invalid_driver');
    }
    if (before.DriverID && (before.DriverID !== op.driverId || before['現在使用者'] !== op.name)) {
      throw Error('identity_conflict');
    }
    after.DriverID = op.driverId;
    after['現在使用者'] = op.name;
  } else {
    throw Error('unsupported_operation');
  }
  return {
    kind: keys.every(key => before[key] === after[key]) ? 'unchanged' : 'update',
    before,
    after,
    record: {id: op.id, vehicleId: op.vehicleId, before, after},
  };
}
