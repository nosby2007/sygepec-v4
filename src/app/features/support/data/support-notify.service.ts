import { Injectable, inject } from '@angular/core';
import { EmailQueueRepository } from './email-queue.repository';
import { Ticket } from './tickets.repository';

export interface SupportRecipients {
  staffEmails: string[];   // ex: support@... , admin@...
}

@Injectable({ providedIn: 'root' })
export class SupportNotifyService {
  private emailQueue = inject(EmailQueueRepository);

  // TODO: brancher sur settings tenant (Firestore) plus tard.
  // Pour l’instant, set statique (ou inject via config)
  private resolveRecipients(_tenantId: string | null): SupportRecipients {
    return {
      staffEmails: ['support@yourdomain.com'] // <-- remplace par ton email support
    };
  }

  async notifyTicketCreated(ticket: Ticket) {
    const r = this.resolveRecipients(ticket.tenantId ?? null);
    if (!r.staffEmails.length) return;

    await this.emailQueue.enqueue({
      to: r.staffEmails,
      tenantId: ticket.tenantId ?? null,
      ticketId: ticket.id,
      type: 'TICKET_CREATED',
      message: {
        subject: `[Support] New ticket: ${ticket.subject}`,
        text:
          `A new support ticket was created.\n\n` +
          `Subject: ${ticket.subject}\n` +
          `Category: ${ticket.category}\nPriority: ${ticket.priority}\nStatus: ${ticket.status}\n` +
          `Ticket ID: ${ticket.id}\n`,
        html:
          `<p>A new support ticket was created.</p>` +
          `<p><b>Subject:</b> ${ticket.subject}<br/>` +
          `<b>Category:</b> ${ticket.category}<br/>` +
          `<b>Priority:</b> ${ticket.priority}<br/>` +
          `<b>Status:</b> ${ticket.status}<br/>` +
          `<b>Ticket ID:</b> ${ticket.id}</p>`
      }
    });
  }

  async notifyStaffReply(ticket: Ticket, clientEmail?: string | null, messageBody?: string) {
    if (!clientEmail) return;

    await this.emailQueue.enqueue({
      to: [clientEmail],
      tenantId: ticket.tenantId ?? null,
      ticketId: ticket.id,
      type: 'TICKET_STAFF_REPLY',
      message: {
        subject: `[Support] Update on your ticket: ${ticket.subject}`,
        text:
          `Hello,\n\n` +
          `Our team replied to your ticket.\n\n` +
          `Ticket: ${ticket.subject}\n` +
          (messageBody ? `Message:\n${messageBody}\n\n` : '') +
          `Sygepec Support`,
        html:
          `<p>Hello,</p>` +
          `<p>Our team replied to your ticket <b>${ticket.subject}</b>.</p>` +
          (messageBody ? `<pre style="white-space:pre-wrap">${this.escapeHtml(messageBody)}</pre>` : '') +
          `<p><b>Sygepec Support</b></p>`
      }
    });
  }

  async notifyCustomerReply(ticket: Ticket, customerBody?: string) {
    const r = this.resolveRecipients(ticket.tenantId ?? null);
    if (!r.staffEmails.length) return;

    await this.emailQueue.enqueue({
      to: r.staffEmails,
      tenantId: ticket.tenantId ?? null,
      ticketId: ticket.id,
      type: 'TICKET_CUSTOMER_REPLY',
      message: {
        subject: `[Support] Customer replied: ${ticket.subject}`,
        text:
          `Customer replied to ticket.\n\n` +
          `Ticket: ${ticket.subject}\n` +
          (customerBody ? `Message:\n${customerBody}\n\n` : '') +
          `Ticket ID: ${ticket.id}\n`,
        html:
          `<p>Customer replied to ticket <b>${ticket.subject}</b>.</p>` +
          (customerBody ? `<pre style="white-space:pre-wrap">${this.escapeHtml(customerBody)}</pre>` : '') +
          `<p><b>Ticket ID:</b> ${ticket.id}</p>`
      }
    });
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
