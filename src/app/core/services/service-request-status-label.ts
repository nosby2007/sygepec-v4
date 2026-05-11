import type { ServiceRequest } from '../models/canonical/service.model';

export type ServiceRequestStatus = ServiceRequest['status'];

export interface ServiceRequestStatusView {
  label: string;
  cssClass: 'success' | 'warning' | 'info' | 'danger' | 'neutral';
  description: string;
}

const MAP: Record<ServiceRequestStatus, ServiceRequestStatusView> = {
  requested: {
    label: 'Requested',
    cssClass: 'warning',
    description: 'Your request has been submitted and is awaiting review.',
  },
  in_review: {
    label: 'In review',
    cssClass: 'info',
    description: 'A consultant is reviewing your request.',
  },
  quoted: {
    label: 'Quoted',
    cssClass: 'info',
    description: 'A quote has been prepared. Check your messages for details.',
  },
  accepted: {
    label: 'Approved',
    cssClass: 'success',
    description: 'You accepted the proposal. Work will start shortly.',
  },
  in_progress: {
    label: 'In progress',
    cssClass: 'info',
    description: 'Your request is being handled.',
  },
  completed: {
    label: 'Completed',
    cssClass: 'success',
    description: 'This request has been completed.',
  },
  rejected: {
    label: 'Rejected',
    cssClass: 'danger',
    description: 'This request was declined.',
  },
  cancelled: {
    label: 'Cancelled',
    cssClass: 'neutral',
    description: 'This request has been cancelled.',
  },
};

export function viewForServiceRequestStatus(
  status: ServiceRequestStatus | string | null | undefined,
): ServiceRequestStatusView {
  if (status && status in MAP) return MAP[status as ServiceRequestStatus];
  return {
    label: 'Pending',
    cssClass: 'neutral',
    description: 'Status pending update.',
  };
}
