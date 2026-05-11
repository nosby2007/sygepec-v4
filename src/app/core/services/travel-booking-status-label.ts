import type { TravelBookingStatus } from '../models/canonical/travel-booking.model';

export interface TravelBookingStatusView {
  label: string;
  cssClass: 'success' | 'warning' | 'info' | 'danger' | 'neutral';
  description: string;
}

const MAP: Record<TravelBookingStatus, TravelBookingStatusView> = {
  requested: {
    label: 'Requested',
    cssClass: 'warning',
    description: 'Your booking request has been submitted.',
  },
  in_review: {
    label: 'In review',
    cssClass: 'info',
    description: 'A travel consultant is reviewing your request.',
  },
  quoted: {
    label: 'Quoted',
    cssClass: 'info',
    description: 'A quote has been prepared. Please review and confirm.',
  },
  confirmed: {
    label: 'Confirmed',
    cssClass: 'success',
    description: 'Your booking is confirmed.',
  },
  cancelled: {
    label: 'Cancelled',
    cssClass: 'neutral',
    description: 'This booking has been cancelled.',
  },
  completed: {
    label: 'Completed',
    cssClass: 'success',
    description: 'Trip completed.',
  },
  rejected: {
    label: 'Rejected',
    cssClass: 'danger',
    description: 'This request could not be fulfilled.',
  },
};

export function viewForTravelBookingStatus(
  status: TravelBookingStatus | string | null | undefined,
): TravelBookingStatusView {
  if (status && status in MAP) return MAP[status as TravelBookingStatus];
  return {
    label: 'Pending',
    cssClass: 'neutral',
    description: 'Status pending update.',
  };
}
