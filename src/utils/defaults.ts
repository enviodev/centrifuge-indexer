// Timestamp/block/txHash default helpers for entity creation and updates

type EventMeta = {
  block: { timestamp: number; number: number };
  transaction: { hash: string };
};

export function createdDefaults(event: EventMeta) {
  return {
    createdAt: event.block.timestamp,
    createdAtBlock: event.block.number,
    createdAtTxHash: event.transaction.hash,
    updatedAt: event.block.timestamp,
    updatedAtBlock: event.block.number,
    updatedAtTxHash: event.transaction.hash,
  };
}

export function updatedDefaults(event: EventMeta) {
  return {
    updatedAt: event.block.timestamp,
    updatedAtBlock: event.block.number,
    updatedAtTxHash: event.transaction.hash,
  };
}
