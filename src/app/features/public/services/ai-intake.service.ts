import { Injectable } from '@angular/core';

export interface IntakeMessage {
  role: 'bot' | 'user';
  text: string;
}

export type IntakeStage =
  | 'welcome'
  | 'destination_followup'
  | 'audit_explanation'
  | 'readiness_capture'
  | 'conversion';

export interface IntakeState {
  sessionId: string;
  leadId: string | null;
  stage: IntakeStage;
  destination: string | null;
  answers: Record<string, string>;
  lastMessage: string;
  quickReplies: string[];
  messages: IntakeMessage[];
}

const STORAGE_KEY = 'sygepec.ai.intake.session';

@Injectable({ providedIn: 'root' })
export class AiIntakeService {
  bootstrap(): IntakeState {
    const state: IntakeState = {
      sessionId: crypto.randomUUID(),
      leadId: null,
      stage: 'welcome',
      destination: null,
      answers: {},
      lastMessage: 'Welcome to SYGEPEC. You are finally ready to take action. Tell me first: where do you want to immigrate?',
      quickReplies: ['Canada', 'USA', 'UAE', 'Qatar', 'Europe', 'I am not sure yet'],
      messages: [
        {
          role: 'bot',
          text: 'Welcome to SYGEPEC. You are finally ready to take action. Tell me first: where do you want to immigrate?',
        },
      ],
    };

    this.persist(state);
    return state;
  }

  restoreSession(): IntakeState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as IntakeState;
      }
    } catch {
      // Ignore corrupted local state and restart cleanly.
    }

    return {
      sessionId: crypto.randomUUID(),
      leadId: null,
      stage: 'welcome',
      destination: null,
      answers: {},
      lastMessage: '',
      quickReplies: [],
      messages: [],
    };
  }

  canLaunchAudit(state: IntakeState): boolean {
    return state.stage === 'audit_explanation' || state.stage === 'conversion';
  }

  answer(state: IntakeState, reply: string): IntakeState {
    const next = this.appendUser(state, reply);

    switch (state.stage) {
      case 'welcome':
        return this.persistAndReturn(this.withBot(next, {
          stage: 'destination_followup',
          destination: reply,
          answers: { ...next.answers, destinationCountry: reply },
          text: this.destinationMessage(reply),
          quickReplies: ['Yes, already done', 'No, explain it to me', 'I am not sure'],
        }));

      case 'destination_followup':
        if (reply === 'No, explain it to me') {
          return this.persistAndReturn(this.withBot(next, {
            stage: 'audit_explanation',
            text: 'A personal immigration audit is an administrative review of your profile before starting a procedure. It looks at your age, education, work experience, language level, budget, family situation, documents, and destination goal. It helps avoid choosing the wrong pathway or preparing useless documents. Let us begin step by step.',
            quickReplies: ['Start My Audit', 'Talk to an Advisor'],
          }));
        }

        if (reply === 'Yes, already done') {
          return this.persistAndReturn(this.withBot(next, {
            stage: 'readiness_capture',
            text: 'Perfect. SYGEPEC can turn that audit into a structured pathway with document readiness, training recommendations, and human review. What is your main profile gap today?',
            quickReplies: ['Missing documents', 'Language test not ready', 'Need pathway clarity', 'Need travel support'],
          }));
        }

        return this.persistAndReturn(this.withBot(next, {
          stage: 'audit_explanation',
          text: 'No problem. SYGEPEC will start with your destination, personal profile, documents, and goals, then generate a readiness score, next steps, and a human-review-ready case summary.',
          quickReplies: ['Start My Audit', 'Talk to an Advisor'],
        }));

      case 'audit_explanation':
        return this.persistAndReturn(this.withBot(next, {
          stage: 'conversion',
          text: reply === 'Talk to an Advisor'
            ? 'A SYGEPEC advisor can help you validate your destination, documents, and next steps. You can continue with your audit now and request human review once your profile is structured.'
            : 'Excellent. Your next step is the personal audit. It will create your structured SYGEPEC profile, identify missing documents, and prepare recommendations for training and travel readiness.',
          quickReplies: ['Start My Audit', 'Contact Advisor'],
        }));

      case 'readiness_capture':
        return this.persistAndReturn(this.withBot(next, {
          stage: 'conversion',
          text: `Understood. For ${state.destination || 'your target destination'}, SYGEPEC will prioritise ${reply.toLowerCase()} first, then prepare your case for human review. Start the audit to generate your readiness score and case summary.`,
          quickReplies: ['Start My Audit', 'Contact Advisor'],
        }));

      default:
        return this.persistAndReturn(this.withBot(next, {
          stage: 'conversion',
          text: 'Your intake session is saved. Start your audit when you are ready, or contact an advisor for human review support.',
          quickReplies: ['Start My Audit', 'Contact Advisor'],
        }));
    }
  }

  private destinationMessage(destination: string): string {
    if (destination === 'Canada') {
      return 'Great choice. Canada offers multiple pathways including study, work, skilled immigration, provincial options, and professional licensing routes. But before choosing a pathway, we need to understand your profile. Have you already completed a personal immigration audit?';
    }

    return `${destination} is a strong pathway option, but the right route depends on your profile, documents, budget, timeline, and training needs. Have you already completed a personal immigration audit?`;
  }

  private appendUser(state: IntakeState, reply: string): IntakeState {
    return {
      ...state,
      answers: { ...state.answers, lastReply: reply },
      messages: [...state.messages, { role: 'user', text: reply }],
    };
  }

  private withBot(
    state: IntakeState,
    config: { stage: IntakeStage; text: string; quickReplies: string[]; destination?: string | null; answers?: Record<string, string> },
  ): IntakeState {
    return {
      ...state,
      stage: config.stage,
      destination: config.destination ?? state.destination,
      answers: config.answers ?? state.answers,
      lastMessage: config.text,
      quickReplies: config.quickReplies,
      messages: [...state.messages, { role: 'bot', text: config.text }],
    };
  }

  private persistAndReturn(state: IntakeState): IntakeState {
    this.persist(state);
    return state;
  }

  private persist(state: IntakeState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Non-blocking when storage is unavailable.
    }
  }
}
