// Transmission states of an electronic submission, and the only moves allowed between
// them. Pure data: shared by the server, the screens and the tests.
//
// Three rules shape this table:
//   - A response from the network is never an acceptance. Only an acknowledgement moves a
//     submission to ACCEPTED or REJECTED.
//   - When nobody knows whether the receiver got the package (INDETERMINATE), it cannot
//     be sent again until that is reconciled. Otherwise a return could be filed twice.
//   - An accepted or rejected submission is final. A corrected return is a new submission.

export class EfileError extends Error {
  constructor(message, status = 400, code = "EFILE_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const EFILE_STATES = ["NOT_READY", "VALIDATED", "SIGNATURE_PENDING", "READY_TO_TRANSMIT", "TRANSMITTING", "TRANSMITTED", "ACK_PENDING", "ACCEPTED", "REJECTED", "FAILED_RETRYABLE", "INDETERMINATE"];

export const EFILE_LABEL = {
  NOT_READY: "Not ready",
  VALIDATED: "Package validated",
  SIGNATURE_PENDING: "Waiting for signatures",
  READY_TO_TRANSMIT: "Ready to transmit",
  TRANSMITTING: "Transmitting",
  TRANSMITTED: "Sent, receipt recorded",
  ACK_PENDING: "Waiting for the acknowledgement",
  ACCEPTED: "Accepted (acknowledgement received)",
  REJECTED: "Rejected (acknowledgement received)",
  FAILED_RETRYABLE: "Not sent, can be retried",
  INDETERMINATE: "Outcome unknown, reconcile before retrying",
};

const MOVES = {
  NOT_READY: { VALIDATION_PASSED: "VALIDATED" },
  VALIDATED: { SIGNATURES_MISSING: "SIGNATURE_PENDING", SIGNATURES_COMPLETE: "READY_TO_TRANSMIT", INVALIDATED: "NOT_READY" },
  SIGNATURE_PENDING: { SIGNATURES_COMPLETE: "READY_TO_TRANSMIT", INVALIDATED: "NOT_READY" },
  READY_TO_TRANSMIT: { SEND_STARTED: "TRANSMITTING", INVALIDATED: "NOT_READY", SIGNATURES_MISSING: "SIGNATURE_PENDING" },
  // CLAIM_EXPIRED: the server stopped between claiming and recording the send. Nobody knows
  // whether the receiver got it, so it is reconciled like any unknown outcome.
  TRANSMITTING: { RECEIPT: "TRANSMITTED", SEND_FAILED: "FAILED_RETRYABLE", OUTCOME_UNKNOWN: "INDETERMINATE", CLAIM_EXPIRED: "INDETERMINATE" },
  TRANSMITTED: { AWAITING_ACK: "ACK_PENDING" },
  ACK_PENDING: { ACK_ACCEPTED: "ACCEPTED", ACK_REJECTED: "REJECTED" },
  FAILED_RETRYABLE: { SEND_STARTED: "TRANSMITTING", INVALIDATED: "NOT_READY" },
  INDETERMINATE: { RECONCILED_RECEIVED: "ACK_PENDING", RECONCILED_NOT_RECEIVED: "FAILED_RETRYABLE" },
  ACCEPTED: {},
  REJECTED: {},
};

export const FINAL_STATES = ["ACCEPTED", "REJECTED"];
// States in which the package is, or may be, with the receiver: nothing may change.
export const IN_FLIGHT = ["TRANSMITTING", "TRANSMITTED", "ACK_PENDING", "INDETERMINATE", "ACCEPTED"];

export function transition(from, event) {
  const to = MOVES[from]?.[event];
  if (!to) throw new EfileError(`A submission that is "${EFILE_LABEL[from] || from}" cannot take the step ${event}.`, 409, "EFILE_BAD_TRANSITION");
  return to;
}

export const canTransition = (from, event) => Boolean(MOVES[from]?.[event]);
