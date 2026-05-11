import { Observable } from 'rxjs';
import { EntityId } from '../../../core/data/repository.types';

export interface Message {
  id: EntityId;
  ticketId: string;
  senderUid: string;
  senderName?: string;
  body: string;
  createdAt?: any;
}

export abstract class MessagesRepository {
  abstract listByTicket(ticketId: string): Observable<Message[]>;
  abstract addMessage(ticketId: string, input: Omit<Message, 'id' | 'createdAt'>): Promise<string>;
}
